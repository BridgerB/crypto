import type { Result } from "../types/config.ts";

export interface CudaMiningRequest {
  blockHeaderHex: string; // 160 hex chars (80 bytes)
  nonceStart: number; // Worker's nonce range start
  nonceEnd: number; // Worker's nonce range end
  targetHex: string; // 64 hex chars (32 bytes)
}

export interface CudaMiningResult {
  type: "found" | "exhausted" | "error";
  nonce?: number; // If found
  hash?: string; // If found
  attempts: number; // Total attempts made
  message?: string; // If error
}

export interface ExtendedMiningRequest {
  blockTemplate: any; // BlockTemplate
  nonceStart: number;
  nonceEnd: number;
  extraNonceStart: number;
  extraNonceEnd: number;
  payoutAddress?: string;
}

export interface ExtendedMiningResult {
  type: "found" | "exhausted" | "error";
  nonce?: number;
  extraNonce?: number;
  hash?: string;
  attempts: number;
  extraNonceCycles: number;
  message?: string;
}

export interface CudaProcessConfig {
  binaryPath: string;
  timeoutMs: number;
  progressIntervalMs: number;
}

export function createCudaProcessConfig(): CudaProcessConfig {
  return {
    binaryPath: "./bin/bitcoin_miner",
    timeoutMs: 300000, // 5 minutes
    progressIntervalMs: 5000, // 5 seconds
  };
}

function parseCudaOutput(output: string): CudaMiningResult {
  const lines = output.trim().split("\n");
  const lastLine = lines[lines.length - 1];

  if (lastLine.startsWith("FOUND ")) {
    const parts = lastLine.split(" ");
    if (parts.length >= 3) {
      const nonce = parseInt(parts[1], 10);
      const hash = parts[2];
      // Extract attempts from debug output if available
      let attempts = 0;
      for (const line of lines) {
        const attemptMatch = line.match(/(\d+) attempts/);
        if (attemptMatch) {
          attempts = parseInt(attemptMatch[1], 10);
        }
      }
      return {
        type: "found",
        nonce,
        hash,
        attempts,
      };
    }
  }

  if (lastLine.startsWith("EXHAUSTED ")) {
    const parts = lastLine.split(" ");
    if (parts.length >= 2) {
      const attempts = parseInt(parts[1], 10);
      return {
        type: "exhausted",
        attempts,
      };
    }
  }

  if (lastLine.startsWith("ERROR ")) {
    const message = lastLine.substring(6); // Remove "ERROR " prefix
    return {
      type: "error",
      attempts: 0,
      message,
    };
  }

  // Fallback for unexpected output
  return {
    type: "error",
    attempts: 0,
    message: `Unexpected CUDA output: ${lastLine}`,
  };
}

export async function runCudaMiner(
  request: CudaMiningRequest,
  config: CudaProcessConfig,
): Promise<Result<CudaMiningResult>> {
  try {
    // Validate inputs
    if (request.blockHeaderHex.length !== 160) {
      return {
        success: false,
        error:
          `Invalid block header length: ${request.blockHeaderHex.length}, expected 160`,
      };
    }

    if (request.targetHex.length !== 64) {
      return {
        success: false,
        error:
          `Invalid target length: ${request.targetHex.length}, expected 64`,
      };
    }

    if (request.nonceStart > request.nonceEnd) {
      return {
        success: false,
        error:
          `Invalid nonce range: start ${request.nonceStart} > end ${request.nonceEnd}`,
      };
    }

    // Prepare command arguments
    const args = [
      request.blockHeaderHex,
      request.nonceStart.toString(),
      request.nonceEnd.toString(),
      request.targetHex,
    ];

    // Create command
    const command = new Deno.Command(config.binaryPath, {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    // Execute with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const process = command.spawn();
      const { code, stdout, stderr } = await process.output();

      clearTimeout(timeoutId);

      if (code !== 0) {
        const errorOutput = new TextDecoder().decode(stderr);
        return {
          success: false,
          error: `CUDA process failed with code ${code}: ${errorOutput}`,
        };
      }

      const output = new TextDecoder().decode(stdout);
      const result = parseCudaOutput(output);

      return { success: true, data: result };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: `CUDA process timeout after ${config.timeoutMs}ms`,
        };
      }

      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testCudaAvailability(
  config: CudaProcessConfig,
): Promise<Result<boolean>> {
  try {
    // Test with a minimal command that should fail quickly but indicate CUDA is working
    const command = new Deno.Command(config.binaryPath, {
      args: [], // No arguments should show usage
      stdout: "piped",
      stderr: "piped",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Short timeout for availability check

    try {
      const process = command.spawn();
      const { code } = await process.output();

      clearTimeout(timeoutId);

      // Exit code 1 with usage message indicates CUDA binary is working
      return { success: true, data: code === 1 };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "CUDA availability check timeout" };
      }

      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
