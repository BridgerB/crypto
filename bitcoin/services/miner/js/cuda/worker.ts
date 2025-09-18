import {
  calculateMerkleRootFromTemplate,
  serializeBlockHeaderForCuda,
} from "./mining/core.ts";
import {
  createCudaProcessConfig,
  runCudaMiner,
} from "./mining/cuda-process.ts";
import { MINING_CONSTANTS } from "./utils/constants.ts";
import type { BlockTemplate } from "./types/bitcoin.ts";
import type {
  WorkerErrorMessage,
  WorkerExhaustedMessage,
  WorkerFoundMessage,
  WorkerMessage,
  WorkerProgressMessage,
} from "./types/worker.ts";

interface WorkerState {
  isRunning: boolean;
  workerId: number;
  progressReportInterval: number;
  currentTemplate: BlockTemplate | null;
  shouldRestart: boolean;
}

let workerState: WorkerState = {
  isRunning: false,
  workerId: 0,
  progressReportInterval: MINING_CONSTANTS.DEFAULT_PROGRESS_REPORT_INTERVAL,
  currentTemplate: null,
  shouldRestart: false,
};

function updateWorkerState(updates: Partial<WorkerState>): void {
  workerState = { ...workerState, ...updates };
}

function createErrorMessage(error: unknown): WorkerErrorMessage {
  return {
    type: "error",
    workerId: workerState.workerId,
    error: error instanceof Error ? error.message : String(error),
  };
}

function createProgressMessage(
  nonce: number,
  hash: string,
  attempts: number,
  hashRate: number,
): WorkerProgressMessage {
  return {
    type: "progress",
    workerId: workerState.workerId,
    currentNonce: nonce,
    hash,
    attempts,
    hashRate,
  };
}

function createFoundMessage(
  nonce: number,
  hash: string,
  attempts: number,
  merkleRoot: string,
  blockHeight: number,
  serializedBlock?: string,
): WorkerFoundMessage {
  return {
    type: "found",
    workerId: workerState.workerId,
    nonce,
    hash,
    attempts,
    totalAttempts: attempts,
    merkleRoot,
    blockHeight,
    serializedBlock,
  };
}

function createExhaustedMessage(attempts: number): WorkerExhaustedMessage {
  return {
    type: "exhausted",
    workerId: workerState.workerId,
    attempts,
  };
}

function logWorkerStart(nonceStart: number, nonceEnd: number): void {
  console.log(
    `Worker ${workerState.workerId}: Starting mining from nonce ${nonceStart.toLocaleString()} to ${nonceEnd.toLocaleString()}`,
  );
}

function logWorkerStop(): void {
  console.log(`Worker ${workerState.workerId}: Received stop signal`);
}

function logBlockFound(nonce: number, hash: string): void {
  console.log(
    `Worker ${workerState.workerId}: 🎉 FOUND WINNING BLOCK! Nonce: ${nonce.toLocaleString()}, Hash: ${hash}`,
  );
}

function logRangeExhausted(nonceStart: number, nonceEnd: number): void {
  console.log(
    `Worker ${workerState.workerId}: Exhausted nonce range (${nonceStart.toLocaleString()} to ${nonceEnd.toLocaleString()})`,
  );
}

async function mineRange(
  blockTemplate: BlockTemplate,
  nonceStart: number,
  nonceEnd: number,
): Promise<void> {
  const startTime = Date.now();
  let currentTemplate = blockTemplate;

  // Use optimized CUDA miner for maximum performance and minimal overhead
  console.log(
    `Worker ${workerState.workerId}: Starting OPTIMIZED CUDA mining from nonce ${nonceStart} to ${nonceEnd} with extraNonce cycling`,
  );

  // Import optimized mining function for maximum performance
  const { runOptimizedCudaMiner } = await import("./mining/optimized-cuda.ts");

  // Calculate optimal extraNonce range for this worker
  // Target: 2^48 attempts total (~281 trillion attempts)
  // Per cycle: 12 workers × 4.3B nonce ≈ 51.6B attempts
  // Required cycles: 281T ÷ 51.6B ≈ 5,450 total extraNonce cycles
  // Strategy: Use much larger ranges for proper coverage with optimized subprocess calls
  const targetExtraNonceCycles = 5450;
  const coverageFactor = 50; // 50x coverage for excellent block finding probability
  const extraNoncePerWorker = Math.ceil(
    (targetExtraNonceCycles * coverageFactor) / 12,
  );

  // With optimized CUDA mining, we use fewer subprocess calls but larger extraNonce ranges
  console.log(
    `🎯 Target: ${targetExtraNonceCycles} total cycles, ${coverageFactor}x coverage factor`,
  );

  const extraNonceStart = workerState.workerId * extraNoncePerWorker;
  const extraNonceEnd = extraNonceStart + extraNoncePerWorker - 1;

  // Calculate total search space for this worker
  const nonceRange = nonceEnd - nonceStart + 1;
  const extraNonceRange = extraNonceEnd - extraNonceStart + 1;
  const totalSearchSpace = nonceRange * extraNonceRange;

  console.log(
    `Worker ${workerState.workerId}: ExtraNonce range ${extraNonceStart}-${extraNonceEnd} (${extraNoncePerWorker.toLocaleString()} values)`,
  );
  console.log(
    `Worker ${workerState.workerId}: Search space: ${
      (totalSearchSpace / 1e12).toFixed(1)
    } trillion attempts (${
      (totalSearchSpace / 281474976710656 * 100).toFixed(2)
    }% of 2^48 target)`,
  );

  // Correct block finding probability calculation for Bitcoin mainnet
  // Difficulty 136 trillion means we need ~136T * 2^32 attempts on average to find a block
  const bitcoinDifficulty = 136e12;
  const attemptsForBlock = bitcoinDifficulty * Math.pow(2, 32); // ~585 quintillion attempts
  const blockFindingProbability = (totalSearchSpace / attemptsForBlock) * 100;
  console.log(
    `Worker ${workerState.workerId}: Block finding probability: ${
      blockFindingProbability.toFixed(6)
    }% (mainnet difficulty: ${(bitcoinDifficulty / 1e12).toFixed(0)}T)`,
  );

  const optimizedRequest = {
    blockTemplate: currentTemplate,
    nonceStart,
    nonceEnd,
    extraNonceStart,
    extraNonceEnd,
    payoutAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // Genesis address for testing
    progressCallback: (progress: any) => {
      // Send progress updates to main thread for hash rate calculation
      const progressMessage = createProgressMessage(
        progress.extraNonce, // Use extraNonce as current "nonce"
        `ExtraNonce ${progress.extraNonce} (${
          progress.percentComplete.toFixed(1)
        }%, ETA: ${(progress.estimatedTimeRemaining / 1000 / 60).toFixed(1)}m)`,
        progress.totalAttempts,
        progress.hashRate,
      );
      self.postMessage(progressMessage);

      console.log(
        `Worker ${workerState.workerId}: ExtraNonce ${progress.extraNonce}/${progress.totalExtraNonceValues} (${
          progress.percentComplete.toFixed(1)
        }%) - ${progress.hashRate.toLocaleString()} H/s avg`,
      );
    },
  };

  // Run optimized CUDA miner with minimal subprocess overhead
  const cudaResult = await runOptimizedCudaMiner(optimizedRequest);

  if (!cudaResult.success) {
    const errorMessage = createErrorMessage(cudaResult.error);
    self.postMessage(errorMessage);
    return;
  }

  const result = cudaResult.data;

  // Handle optimized CUDA mining result
  if (result.type === "found") {
    // Found a valid block with extraNonce!
    const { calculateMerkleRootWithExtraNonce } = await import(
      "./mining/core.ts"
    );
    const merkleResult = await calculateMerkleRootWithExtraNonce(
      currentTemplate,
      result.extraNonce!,
      optimizedRequest.payoutAddress,
    );
    const merkleRoot = merkleResult.success ? merkleResult.data : "unknown";

    console.log(
      `🎉 Worker ${workerState.workerId}: FOUND BLOCK! Nonce: ${result.nonce}, ExtraNonce: ${result.extraNonce}, AvgHashRate: ${result.avgHashRate?.toLocaleString()} H/s`,
    );
    logBlockFound(result.nonce!, result.hash!);

    const foundMessage = createFoundMessage(
      result.nonce!,
      result.hash!,
      result.attempts,
      merkleRoot,
      currentTemplate.height,
    );
    self.postMessage(foundMessage);
    return;
  } else if (result.type === "exhausted") {
    // Exhausted all extraNonce cycles without finding a block
    console.log(
      `💥 Worker ${workerState.workerId}: Exhausted ${result.extraNonceCycles} CUDA cycles (${result.attempts.toLocaleString()} total attempts)`,
    );
    console.log(
      `📊 Worker ${workerState.workerId}: Average performance: ${result.avgHashRate?.toLocaleString()} H/s`,
    );
    logRangeExhausted(extraNonceStart, extraNonceEnd);
    const exhaustedMessage = createExhaustedMessage(result.attempts);
    self.postMessage(exhaustedMessage);
    return;
  } else if (result.type === "error") {
    // Optimized CUDA process error
    const errorMessage = createErrorMessage(
      result.message || "Unknown optimized CUDA error",
    );
    self.postMessage(errorMessage);
    return;
  }
}

async function handleStartMessage(message: WorkerMessage): Promise<void> {
  if (message.type !== "start") return;

  updateWorkerState({
    workerId: message.workerId,
    isRunning: true,
  });

  logWorkerStart(message.nonceStart, message.nonceEnd);
  await mineRange(message.blockTemplate, message.nonceStart, message.nonceEnd);
}

function handleStopMessage(): void {
  logWorkerStop();
  updateWorkerState({ isRunning: false });
  self.close();
}

function handleTemplateUpdateMessage(message: WorkerMessage): void {
  if (message.type !== "template_update") return;

  console.log(
    `Worker ${workerState.workerId}: Received template update for block ${message.blockTemplate.height}`,
  );

  updateWorkerState({
    currentTemplate: message.blockTemplate,
    shouldRestart: message.shouldRestart,
  });

  if (message.shouldRestart) {
    console.log(
      `Worker ${workerState.workerId}: Will restart mining with new template`,
    );
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    if (message.type === "start") {
      await handleStartMessage(message);
    } else if (message.type === "stop") {
      handleStopMessage();
    } else if (message.type === "template_update") {
      handleTemplateUpdateMessage(message);
    }
  } catch (error) {
    const errorMessage = createErrorMessage(error);
    self.postMessage(errorMessage);
  }
};
