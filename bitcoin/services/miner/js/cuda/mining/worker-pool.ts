import { calculateNonceRanges } from "./core.ts";
import {
  addWorker,
  calculateProgress,
  createInitialMiningState,
  createWorkerInfo,
  isAllWorkersExhausted,
  type MiningState,
  miningStateReducer,
  removeAllWorkers,
} from "./state.ts";
import {
  logAllWorkersExhausted,
  logBlockFound,
  logExtendedMiningProgress,
  type Logger,
  logMiningStatus,
  logWorkerExhausted,
  logWorkerStart,
} from "../utils/logger.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import type { MiningConfig } from "../types/mining.ts";
import type {
  WorkerResponse,
  WorkerStartMessage,
  WorkerStopMessage,
  WorkerTemplateUpdateMessage,
} from "../types/worker.ts";
import type { Result } from "../types/config.ts";

export interface WorkerPoolDependencies {
  logger: Logger;
  createWorker: (scriptURL: string) => Worker;
  setInterval: (callback: () => void, ms: number) => number;
  clearInterval: (intervalId: number) => void;
  exit: (code: number) => void;
}

export function createWorkerPool(
  config: MiningConfig,
  dependencies: WorkerPoolDependencies,
): {
  startMining: (blockTemplate: BlockTemplate) => Promise<Result<void>>;
  updateBlockTemplate: (
    newTemplate: BlockTemplate,
    shouldRestart: boolean,
  ) => Promise<Result<void>>;
  stopAllWorkers: () => void;
  getState: () => MiningState;
} {
  let state = createInitialMiningState(config);
  let progressInterval: number | null = null;
  let currentBlockTemplate: BlockTemplate | null = null;

  const dispatch = (action: any) => {
    state = miningStateReducer(state, action);
  };

  const handleWorkerMessage = (message: WorkerResponse): void => {
    switch (message.type) {
      case "progress":
        dispatch({
          type: "UPDATE_PROGRESS",
          workerId: message.workerId,
          attempts: message.attempts,
        });
        break;

      case "found":
        const progress = calculateProgress(state);
        dependencies.logger.info(
          `\n🎉 VALID BLOCK FOUND! 🎉\n` +
            `Worker: ${message.workerId}\n` +
            `Nonce: ${message.nonce.toLocaleString()}\n` +
            `Hash: ${message.hash}\n` +
            `Block Height: ${message.blockHeight}\n` +
            `Merkle Root: ${message.merkleRoot}\n` +
            `Attempts: ${message.attempts.toLocaleString()}\n` +
            `Total Attempts: ${progress.totalAttempts.toLocaleString()}`,
        );

        dispatch({
          type: "BLOCK_FOUND",
          workerId: message.workerId,
          attempts: message.attempts,
        });
        stopAllWorkers();
        dependencies.exit(0);
        break;

      case "exhausted":
        logWorkerExhausted(
          message.workerId,
          message.attempts,
          dependencies.logger,
        );
        dispatch({ type: "WORKER_EXHAUSTED", workerId: message.workerId });

        if (isAllWorkersExhausted(state)) {
          const progress = calculateProgress(state);
          logAllWorkersExhausted(progress.totalAttempts, dependencies.logger);
          stopAllWorkers();
        }
        break;

      case "error":
        dependencies.logger.error(
          `Worker ${message.workerId} error: ${message.error}`,
        );
        dispatch({ type: "WORKER_ERROR", workerId: message.workerId });
        break;

      default:
        dependencies.logger.warn(
          `Unknown worker message type: ${JSON.stringify(message)}`,
        );
    }
  };

  const createWorkerWithHandlers = async (
    workerId: number,
    blockTemplate: BlockTemplate,
    nonceStart: number,
    nonceEnd: number,
  ): Promise<Result<Worker>> => {
    try {
      const worker = dependencies.createWorker(
        new URL("../worker.ts", import.meta.url).href,
      );

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        handleWorkerMessage(event.data);
      };

      worker.onerror = (error) => {
        dependencies.logger.error(`Worker ${workerId} error: ${error}`);
        dispatch({ type: "WORKER_ERROR", workerId: workerId });
      };

      const startMessage: WorkerStartMessage = {
        type: "start",
        blockTemplate,
        nonceStart,
        nonceEnd,
        workerId,
      };

      worker.postMessage(startMessage);
      logWorkerStart(workerId, nonceStart, nonceEnd, dependencies.logger);

      const workerInfo = createWorkerInfo(workerId, {
        start: nonceStart,
        end: nonceEnd,
      }, worker);
      state = addWorker(state, workerInfo);

      return { success: true, data: worker };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const startProgressReporting = (): void => {
    progressInterval = dependencies.setInterval(() => {
      if (!state.isRunning) {
        if (progressInterval !== null) {
          dependencies.clearInterval(progressInterval);
          progressInterval = null;
        }
        return;
      }

      const progress = calculateProgress(state);
      logMiningStatus({
        totalHashes: progress.totalAttempts,
        totalHashRate: progress.hashRate,
        workersActive: progress.workersActive,
        startTime: state.stats.startTime,
        elapsedTime: state.stats.elapsedTime,
      }, dependencies.logger);

      // Add enhanced extended mining progress every 30 seconds
      if (
        currentBlockTemplate &&
        Date.now() % 30000 < config.progressReportingIntervalMs
      ) {
        // Calculate difficulty from target (Bitcoin formula)
        const targetBig = BigInt("0x" + currentBlockTemplate.target);
        const maxTarget = BigInt(
          "0x00000000ffff0000000000000000000000000000000000000000000000000000",
        );
        const difficulty = Number(maxTarget / targetBig);
        logExtendedMiningProgress(
          config.workerCount,
          progress.totalAttempts,
          progress.hashRate,
          difficulty,
          dependencies.logger,
        );
      }
    }, config.progressReportingIntervalMs);
  };

  const startMining = async (
    blockTemplate: BlockTemplate,
  ): Promise<Result<void>> => {
    if (state.isRunning) {
      return { success: false, error: "Mining is already running" };
    }

    // Store current block template for progress reporting
    currentBlockTemplate = blockTemplate;

    dispatch({
      type: "START_MINING",
      startTime: Date.now(),
      workerCount: config.workerCount,
    });

    dependencies.logger.info(
      `\n=== STARTING MULTI-THREADED BITCOIN MINING ===`,
    );
    dependencies.logger.info(
      `💡 Using ${config.workerCount} workers across all CPU cores`,
    );
    dependencies.logger.info(`💡 Each worker will mine a separate nonce range`);
    dependencies.logger.info(`💡 Press Ctrl+C to stop mining\n`);

    const isGenesis = blockTemplate.height === 0;
    const nonceRanges = calculateNonceRanges(
      config.workerCount,
      config.maxNonceValue,
      isGenesis,
    );

    for (let i = 0; i < config.workerCount; i++) {
      const range = nonceRanges[i];
      const workerResult = await createWorkerWithHandlers(
        i,
        blockTemplate,
        range.start,
        range.end,
      );

      if (!workerResult.success) {
        dependencies.logger.error(
          `Failed to create worker ${i}: ${workerResult.error}`,
        );
        return workerResult;
      }
    }

    startProgressReporting();
    return { success: true, data: undefined };
  };

  const stopAllWorkers = (): void => {
    dependencies.logger.info(
      `🛑 Stopping all ${state.workers.length} workers...`,
    );

    if (progressInterval !== null) {
      dependencies.clearInterval(progressInterval);
      progressInterval = null;
    }

    const stopMessage: WorkerStopMessage = { type: "stop" };

    state.workers.forEach((workerInfo, index) => {
      if (workerInfo.worker) {
        try {
          workerInfo.worker.postMessage(stopMessage);
          workerInfo.worker.terminate();
        } catch (error) {
          dependencies.logger.warn(`Error stopping worker ${index}: ${error}`);
        }
      }
    });

    state = removeAllWorkers(state);
    dispatch({ type: "STOP_MINING" });
  };

  const updateBlockTemplate = async (
    newTemplate: BlockTemplate,
    shouldRestart: boolean = true,
  ): Promise<Result<void>> => {
    if (!state.isRunning) {
      return { success: false, error: "Mining is not running" };
    }

    dependencies.logger.info(
      `🔄 Updating block template for all ${state.workers.length} workers (Height: ${newTemplate.height})`,
    );

    const updateMessage: WorkerTemplateUpdateMessage = {
      type: "template_update",
      blockTemplate: newTemplate,
      shouldRestart,
    };

    let successCount = 0;
    let errorCount = 0;

    // Send update to all active workers
    state.workers.forEach((workerInfo) => {
      if (workerInfo.worker && workerInfo.active) {
        try {
          workerInfo.worker.postMessage(updateMessage);
          successCount++;
        } catch (error) {
          dependencies.logger.warn(
            `Failed to send template update to worker ${workerInfo.id}: ${error}`,
          );
          errorCount++;
        }
      }
    });

    if (shouldRestart) {
      dependencies.logger.info(
        `⚡ Template update sent to ${successCount} workers (restart required)`,
      );
    } else {
      dependencies.logger.info(
        `🔄 Template update sent to ${successCount} workers (no restart)`,
      );
    }

    if (errorCount > 0) {
      dependencies.logger.warn(`Failed to update ${errorCount} workers`);
    }

    return { success: true, data: undefined };
  };

  const getState = (): MiningState => state;

  return {
    startMining,
    updateBlockTemplate,
    stopAllWorkers,
    getState,
  };
}
