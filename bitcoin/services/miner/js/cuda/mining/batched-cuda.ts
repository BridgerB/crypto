import type { Result } from "../types/config.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import {
  createCudaProcessConfig,
  type CudaMiningRequest,
  type CudaProcessConfig,
  runCudaMiner,
} from "./cuda-process.ts";

export interface BatchedMiningRequest {
  blockTemplate: BlockTemplate;
  nonceStart: number;
  nonceEnd: number;
  extraNonceStart: number;
  extraNonceEnd: number;
  batchSize: number; // Process this many extraNonce values per CUDA call
  payoutAddress?: string;
  progressCallback?: (progress: BatchedMiningProgress) => void;
}

export interface BatchedMiningProgress {
  extraNonceBatch: number;
  totalBatches: number;
  currentBatchAttempts: number;
  totalAttempts: number;
  hashRate: number;
  percentComplete: number;
}

export interface BatchedMiningResult {
  type: "found" | "exhausted" | "error";
  nonce?: number;
  extraNonce?: number;
  hash?: string;
  attempts: number;
  batches: number;
  message?: string;
}

/**
 * Batched CUDA mining that processes multiple extraNonce values efficiently
 * by reducing subprocess overhead and maximizing CUDA utilization
 */
export async function runBatchedCudaMiner(
  request: BatchedMiningRequest,
  config?: CudaProcessConfig,
): Promise<Result<BatchedMiningResult>> {
  try {
    let totalAttempts = 0;
    let batches = 0;
    const cudaConfig = config || createCudaProcessConfig();

    // Import the core functions we need
    const { createCachedMerkleCalculator } = await import(
      "./optimized-merkle.ts"
    );
    const { serializeBlockHeaderForCuda } = await import("./core.ts");

    console.log(
      `🚀 Starting BATCHED CUDA mining: extraNonce ${request.extraNonceStart}-${request.extraNonceEnd}, batch size: ${request.batchSize}`,
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

    const totalExtraNonceValues = request.extraNonceEnd -
      request.extraNonceStart + 1;
    const totalBatches = Math.ceil(totalExtraNonceValues / request.batchSize);

    // Process extraNonce values in batches to minimize subprocess overhead
    for (
      let batchStart = request.extraNonceStart;
      batchStart <= request.extraNonceEnd;
      batchStart += request.batchSize
    ) {
      batches++;
      const batchEnd = Math.min(
        batchStart + request.batchSize - 1,
        request.extraNonceEnd,
      );
      const batchSize = batchEnd - batchStart + 1;

      console.log(
        `📦 Batch ${batches}/${totalBatches}: Processing extraNonce ${batchStart}-${batchEnd} (${batchSize} values)`,
      );

      // For each extraNonce in the batch, test with CUDA
      for (let extraNonce = batchStart; extraNonce <= batchEnd; extraNonce++) {
        const startTime = Date.now();

        // Calculate merkle root for this extraNonce (optimized)
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

        // Create block header with new merkle root (reuse base header)
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
        const elapsedMs = Date.now() - startTime;
        const hashRate = Math.floor(
          cudaResult.data.attempts / (elapsedMs / 1000),
        );

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
              batches,
            },
          };
        } else if (cudaResult.data.type === "error") {
          return {
            success: false,
            error:
              `CUDA error for extraNonce ${extraNonce}: ${cudaResult.data.message}`,
          };
        }

        // Send progress update for this extraNonce
        if (request.progressCallback) {
          const percentComplete = ((extraNonce - request.extraNonceStart + 1) /
            totalExtraNonceValues) * 100;
          request.progressCallback({
            extraNonceBatch: batches,
            totalBatches,
            currentBatchAttempts: cudaResult.data.attempts,
            totalAttempts,
            hashRate,
            percentComplete,
          });
        }

        console.log(
          `⚡ ExtraNonce ${extraNonce}: ${cudaResult.data.attempts.toLocaleString()} attempts, ${hashRate.toLocaleString()} H/s, total: ${totalAttempts.toLocaleString()}`,
        );
      }

      console.log(
        `✅ Completed batch ${batches}/${totalBatches}: ${batchSize} extraNonce values processed`,
      );
    }

    // Exhausted all extraNonce values
    console.log(
      `💥 Exhausted all extraNonce values (${batches} batches, ${totalAttempts.toLocaleString()} total attempts)`,
    );
    return {
      success: true,
      data: {
        type: "exhausted",
        attempts: totalAttempts,
        batches,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Calculates optimal batch size based on performance characteristics
 */
export function calculateOptimalBatchSize(
  totalExtraNonceValues: number,
  targetBatches: number = 100, // Target number of batches for good progress reporting
): number {
  const batchSize = Math.max(
    1,
    Math.ceil(totalExtraNonceValues / targetBatches),
  );
  return Math.min(batchSize, 1000); // Cap at 1000 to prevent excessive memory usage
}
