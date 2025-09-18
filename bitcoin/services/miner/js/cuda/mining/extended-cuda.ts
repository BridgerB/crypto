import type { Result } from "../types/config.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import {
  createCudaProcessConfig,
  type CudaMiningRequest,
  type CudaProcessConfig,
  runCudaMiner,
} from "./cuda-process.ts";

export interface ExtendedMiningRequest {
  blockTemplate: BlockTemplate;
  nonceStart: number;
  nonceEnd: number;
  extraNonceStart: number;
  extraNonceEnd: number;
  payoutAddress?: string;
  progressCallback?: (progress: ExtendedMiningProgress) => void;
}

export interface ExtendedMiningProgress {
  extraNonce: number;
  extraNonceCycle: number;
  totalExtraNonceCycles: number;
  currentCycleAttempts: number;
  totalAttempts: number;
  hashRate: number;
  percentComplete: number;
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

export async function runExtendedCudaMiner(
  request: ExtendedMiningRequest,
  config?: CudaProcessConfig,
): Promise<Result<ExtendedMiningResult>> {
  try {
    let totalAttempts = 0;
    let extraNonceCycles = 0;
    const cudaConfig = config || createCudaProcessConfig();

    // Import the core functions we need
    const { serializeBlockHeaderForCuda } = await import("./core.ts");
    const { createCachedMerkleCalculator } = await import(
      "./optimized-merkle.ts"
    );

    console.log(
      `🚀 Starting extended CUDA mining: extraNonce ${request.extraNonceStart}-${request.extraNonceEnd}, nonce ${request.nonceStart}-${request.nonceEnd}`,
    );

    // Create optimized merkle calculator that caches coinbase structure
    const merkleCalculatorResult = await createCachedMerkleCalculator(
      request.blockTemplate,
      request.payoutAddress || "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    );
    if (!merkleCalculatorResult.success) {
      return {
        success: false,
        error:
          `Failed to create merkle calculator: ${merkleCalculatorResult.error}`,
      };
    }
    const merkleCalculator = merkleCalculatorResult.data;

    // Pre-calculate base block header for optimization
    const baseHeaderResult = await serializeBlockHeaderForCuda(
      request.blockTemplate,
      0,
    );
    if (!baseHeaderResult.success) {
      return {
        success: false,
        error: `Failed to serialize base header: ${baseHeaderResult.error}`,
      };
    }

    // Cycle through extraNonce values to extend search space beyond 32-bit nonce
    for (
      let extraNonce = request.extraNonceStart;
      extraNonce <= request.extraNonceEnd;
      extraNonce++
    ) {
      extraNonceCycles++;

      console.log(
        `🔄 ExtraNonce cycle ${extraNonceCycles}: extraNonce=${extraNonce}, target attempts: ${
          (request.nonceEnd - request.nonceStart + 1).toLocaleString()
        }`,
      );

      // Calculate new merkle root with this extraNonce (highly optimized)
      const merkleResult = await merkleCalculator.calculateForExtraNonce(
        extraNonce,
      );

      if (!merkleResult.success) {
        return {
          success: false,
          error:
            `Failed to calculate merkle root for extraNonce ${extraNonce}: ${merkleResult.error}`,
        };
      }

      // Reuse base header and replace only the merkle root (optimized)
      let blockHeaderHex = baseHeaderResult.data;
      const merkleHex = merkleResult.data;

      // Convert merkle root to little-endian format for header
      const merkleBytes = [];
      for (let i = 0; i < merkleHex.length; i += 2) {
        merkleBytes.push(merkleHex.substr(i, 2));
      }
      const merkleReversed = merkleBytes.reverse().join("");

      // Replace merkle root in header (bytes 36-67, hex chars 72-135)
      blockHeaderHex = blockHeaderHex.substring(0, 72) + merkleReversed +
        blockHeaderHex.substring(136);

      // Run CUDA miner on this search space
      const cudaRequest: CudaMiningRequest = {
        blockHeaderHex,
        nonceStart: request.nonceStart,
        nonceEnd: request.nonceEnd,
        targetHex: request.blockTemplate.target,
      };

      const cudaResult = await runCudaMiner(cudaRequest, cudaConfig);
      if (!cudaResult.success) {
        return {
          success: false,
          error:
            `CUDA mining failed for extraNonce ${extraNonce}: ${cudaResult.error}`,
        };
      }

      totalAttempts += cudaResult.data.attempts;

      // Check if we found a solution
      if (cudaResult.data.type === "found") {
        console.log(
          `🎉 FOUND BLOCK! ExtraNonce: ${extraNonce}, Nonce: ${cudaResult.data.nonce}, Hash: ${cudaResult.data.hash}`,
        );
        return {
          success: true,
          data: {
            type: "found",
            nonce: cudaResult.data.nonce!,
            extraNonce,
            hash: cudaResult.data.hash!,
            attempts: totalAttempts,
            extraNonceCycles,
          },
        };
      } else if (cudaResult.data.type === "error") {
        return {
          success: false,
          error:
            `CUDA error for extraNonce ${extraNonce}: ${cudaResult.data.message}`,
        };
      }

      // Continue to next extraNonce if exhausted
      console.log(
        `⚡ Completed extraNonce ${extraNonce}: ${cudaResult.data.attempts.toLocaleString()} attempts, total: ${totalAttempts.toLocaleString()}`,
      );

      // Send progress update to callback
      if (request.progressCallback) {
        const totalExtraNonceCycles = request.extraNonceEnd -
          request.extraNonceStart + 1;
        const cycleTime = 10; // Approximate seconds per cycle based on CUDA performance
        const hashRate = Math.floor(cudaResult.data.attempts / cycleTime);
        const percentComplete = (extraNonceCycles / totalExtraNonceCycles) *
          100;

        request.progressCallback({
          extraNonce,
          extraNonceCycle: extraNonceCycles,
          totalExtraNonceCycles,
          currentCycleAttempts: cudaResult.data.attempts,
          totalAttempts,
          hashRate,
          percentComplete,
        });
      }
    }

    // Exhausted all extraNonce values
    console.log(
      `💥 Exhausted all extraNonce values (${extraNonceCycles} cycles, ${totalAttempts.toLocaleString()} total attempts)`,
    );
    return {
      success: true,
      data: {
        type: "exhausted",
        attempts: totalAttempts,
        extraNonceCycles,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
