import type { Result } from "../types/config.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import {
  createCudaProcessConfig,
  type CudaMiningRequest,
  type CudaProcessConfig,
  runCudaMiner,
} from "./cuda-process.ts";

export interface OptimizedMiningRequest {
  blockTemplate: BlockTemplate;
  nonceStart: number;
  nonceEnd: number;
  extraNonceStart: number;
  extraNonceEnd: number;
  payoutAddress?: string;
  progressCallback?: (progress: OptimizedMiningProgress) => void;
}

export interface OptimizedMiningProgress {
  extraNonce: number;
  totalExtraNonceValues: number;
  currentAttempts: number;
  totalAttempts: number;
  hashRate: number;
  percentComplete: number;
  estimatedTimeRemaining: number;
}

export interface OptimizedMiningResult {
  type: "found" | "exhausted" | "error";
  nonce?: number;
  extraNonce?: number;
  hash?: string;
  attempts: number;
  extraNonceCycles: number;
  avgHashRate: number;
  message?: string;
}

/**
 * Highly optimized CUDA mining that minimizes subprocess overhead
 * by using large nonce ranges and strategic extraNonce selection
 */
export async function runOptimizedCudaMiner(
  request: OptimizedMiningRequest,
  config?: CudaProcessConfig,
): Promise<Result<OptimizedMiningResult>> {
  try {
    let totalAttempts = 0;
    let extraNonceCycles = 0;
    const cudaConfig = config || createCudaProcessConfig();
    const startTime = Date.now();

    // Import CUDA optimization configuration
    const { createOptimalCudaConfig, CudaPerformanceMonitor } = await import(
      "./cuda-config.ts"
    );
    const optimizationConfig = createOptimalCudaConfig();
    const performanceMonitor = new CudaPerformanceMonitor();
    performanceMonitor.startMining();

    // Import the core functions we need
    const { createCachedMerkleCalculator } = await import(
      "./optimized-merkle.ts"
    );
    const { serializeBlockHeaderForCuda } = await import("./core.ts");

    const totalExtraNonceValues = request.extraNonceEnd -
      request.extraNonceStart + 1;
    const nonceRangeSize = request.nonceEnd - request.nonceStart + 1;

    console.log(
      `🚀 OPTIMIZED CUDA Mining: ${totalExtraNonceValues} extraNonce values, ${nonceRangeSize.toLocaleString()} nonce range`,
    );

    // Create optimized merkle calculator
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

    // Pre-calculate base block header
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

    // Strategy: Use optimized batch processing to minimize subprocess overhead
    // while maximizing GPU utilization and maintaining good search coverage
    const maxSubprocessCalls = optimizationConfig.batchSize; // Use optimized batch size
    const extraNonceStep = Math.max(
      1,
      Math.ceil(totalExtraNonceValues / maxSubprocessCalls),
    );

    console.log(
      `📈 Strategy: ${maxSubprocessCalls} subprocess calls, extraNonce step: ${extraNonceStep}`,
    );

    // Cycle through extraNonce values with optimized step size
    for (
      let extraNonce = request.extraNonceStart;
      extraNonce <= request.extraNonceEnd;
      extraNonce += extraNonceStep
    ) {
      extraNonceCycles++;
      const cycleStartTime = Date.now();

      console.log(
        `🔄 Cycle ${extraNonceCycles}: extraNonce=${extraNonce}, nonce range: ${nonceRangeSize.toLocaleString()}`,
      );

      // Calculate merkle root for this extraNonce (highly optimized)
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

      // Convert merkle root to little-endian format for header (optimized)
      const merkleBytes = [];
      for (let i = 0; i < merkleHex.length; i += 2) {
        merkleBytes.push(merkleHex.substr(i, 2));
      }
      const merkleReversed = merkleBytes.reverse().join("");

      // Replace merkle root in header (bytes 36-67, hex chars 72-135)
      blockHeaderHex = blockHeaderHex.substring(0, 72) + merkleReversed +
        blockHeaderHex.substring(136);

      // Run CUDA miner on FULL nonce range for maximum efficiency
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
      const cycleElapsedMs = Date.now() - cycleStartTime;
      const cycleHashRate = Math.floor(
        cudaResult.data.attempts / (cycleElapsedMs / 1000),
      );

      // Record performance metrics for optimization
      performanceMonitor.recordKernelExecution(
        cudaResult.data.attempts,
        cycleElapsedMs,
        85, // Estimated GPU utilization %
        50, // Estimated memory usage %
      );

      // Check if we found a solution
      if (cudaResult.data.type === "found") {
        const totalElapsedMs = Date.now() - startTime;
        const avgHashRate = Math.floor(totalAttempts / (totalElapsedMs / 1000));

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
            avgHashRate,
          },
        };
      } else if (cudaResult.data.type === "error") {
        return {
          success: false,
          error:
            `CUDA error for extraNonce ${extraNonce}: ${cudaResult.data.message}`,
        };
      }

      // Calculate progress metrics
      const totalElapsedMs = Date.now() - startTime;
      const avgHashRate = Math.floor(totalAttempts / (totalElapsedMs / 1000));
      const percentComplete =
        ((extraNonce - request.extraNonceStart + extraNonceStep) /
          totalExtraNonceValues) * 100;
      const estimatedTotalTime = totalElapsedMs / (percentComplete / 100);
      const estimatedTimeRemaining = estimatedTotalTime - totalElapsedMs;

      // Send progress update
      if (request.progressCallback) {
        request.progressCallback({
          extraNonce,
          totalExtraNonceValues,
          currentAttempts: cudaResult.data.attempts,
          totalAttempts,
          hashRate: avgHashRate,
          percentComplete: Math.min(percentComplete, 100),
          estimatedTimeRemaining: Math.max(0, estimatedTimeRemaining),
        });
      }

      console.log(
        `⚡ ExtraNonce ${extraNonce}: ${cudaResult.data.attempts.toLocaleString()} attempts in ${cycleElapsedMs}ms`,
      );
      console.log(
        `📊 Cycle performance: ${cycleHashRate.toLocaleString()} H/s | Total: ${totalAttempts.toLocaleString()} attempts, ${avgHashRate.toLocaleString()} H/s avg`,
      );
      console.log(
        `🎯 Progress: ${percentComplete.toFixed(2)}% | ETA: ${
          (estimatedTimeRemaining / 1000 / 60).toFixed(1)
        } minutes`,
      );

      // Log optimization metrics
      const perfMetrics = performanceMonitor.getAverageMetrics();
      if (perfMetrics && optimizationConfig.performanceLogging) {
        console.log(
          `🚀 CUDA Performance: Effective ${perfMetrics.effectiveHashRate.toLocaleString()} H/s, Overhead: ${
            perfMetrics.processOverhead.toFixed(3)
          }s`,
        );
      }
    }

    // Exhausted all extraNonce values
    const totalElapsedMs = Date.now() - startTime;
    const avgHashRate = Math.floor(totalAttempts / (totalElapsedMs / 1000));

    console.log(`💥 Exhausted optimized search space:`);
    console.log(
      `   - ${extraNonceCycles} CUDA cycles (${extraNonceStep} extraNonce step)`,
    );
    console.log(`   - ${totalAttempts.toLocaleString()} total attempts`);
    console.log(`   - ${avgHashRate.toLocaleString()} H/s average`);
    console.log(
      `   - ${(totalElapsedMs / 1000 / 60).toFixed(1)} minutes elapsed`,
    );

    return {
      success: true,
      data: {
        type: "exhausted",
        attempts: totalAttempts,
        extraNonceCycles,
        avgHashRate,
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
 * Calculates optimal mining parameters based on performance targets
 */
export function calculateOptimizedStrategy(
  totalExtraNonceValues: number,
  targetHashRate: number = 200_000_000, // 200M H/s target per worker
): {
  maxSubprocessCalls: number;
  extraNonceStep: number;
  estimatedDuration: number;
} {
  // Target: Minimize subprocess calls while maintaining good search coverage
  const maxSubprocessCalls = Math.min(
    100,
    Math.max(10, Math.ceil(totalExtraNonceValues / 100)),
  );
  const extraNonceStep = Math.max(
    1,
    Math.ceil(totalExtraNonceValues / maxSubprocessCalls),
  );

  // Estimate duration based on CUDA performance
  const nonceRangeSize = 4_294_967_295; // Full 32-bit nonce range
  const attemptsPerCycle = nonceRangeSize;
  const totalAttempts = maxSubprocessCalls * attemptsPerCycle;
  const estimatedDuration = (totalAttempts / targetHashRate) * 1000; // ms

  return {
    maxSubprocessCalls,
    extraNonceStep,
    estimatedDuration,
  };
}
