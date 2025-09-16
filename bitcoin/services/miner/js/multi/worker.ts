import { calculateMerkleRootFromTemplate, mineAttempt } from "./mining/core.ts";
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
  let attempts = 0;
  const startTime = Date.now();
  let lastProgressReport = 0;
  let currentTemplate = blockTemplate;

  for (
    let nonce = nonceStart;
    nonce <= nonceEnd && workerState.isRunning;
    nonce++
  ) {
    // Check if we need to restart with new template
    if (workerState.shouldRestart && workerState.currentTemplate) {
      console.log(
        `Worker ${workerState.workerId}: Restarting with new template at nonce ${nonce}`,
      );
      currentTemplate = workerState.currentTemplate;
      workerState.shouldRestart = false;
      // Continue mining with new template from current nonce
    }

    const miningResult = await mineAttempt(currentTemplate, nonce);

    if (!miningResult.success) {
      const errorMessage = createErrorMessage(miningResult.error);
      self.postMessage(errorMessage);
      return;
    }

    attempts++;

    if (miningResult.data.valid) {
      // Calculate merkle root for the valid block
      const merkleResult = await calculateMerkleRootFromTemplate(
        currentTemplate,
      );
      const merkleRoot = merkleResult.success ? merkleResult.data : "unknown";

      const foundMessage = createFoundMessage(
        nonce,
        miningResult.data.hash,
        attempts,
        merkleRoot,
        currentTemplate.height,
      );
      logBlockFound(nonce, miningResult.data.hash);
      self.postMessage(foundMessage);
      return;
    }

    if (attempts - lastProgressReport >= workerState.progressReportInterval) {
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - startTime) / 1000;
      const hashRate = Math.round(attempts / elapsedSeconds);

      const progressMessage = createProgressMessage(
        nonce,
        miningResult.data.hash,
        attempts,
        hashRate,
      );

      self.postMessage(progressMessage);
      lastProgressReport = attempts;
    }
  }

  if (workerState.isRunning) {
    const exhaustedMessage = createExhaustedMessage(attempts);
    logRangeExhausted(nonceStart, nonceEnd);
    self.postMessage(exhaustedMessage);
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
