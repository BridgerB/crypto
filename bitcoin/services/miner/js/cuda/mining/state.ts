import type {
  MiningAction,
  MiningConfig,
  MiningState,
  MiningStats,
  NonceRange,
  WorkerInfo,
} from "../types/mining.ts";

export type {
  MiningAction,
  MiningConfig,
  MiningState,
  MiningStats,
  NonceRange,
  WorkerInfo,
};

export function createInitialMiningState(config: MiningConfig): MiningState {
  return {
    stats: {
      totalHashes: 0,
      totalHashRate: 0,
      workersActive: 0,
      startTime: 0,
      elapsedTime: 0,
    },
    workers: [],
    isRunning: false,
    config,
  };
}

export function createWorkerInfo(
  id: number,
  range: NonceRange,
  worker: Worker,
): WorkerInfo {
  return {
    id,
    range,
    worker,
    active: true,
  };
}

export function miningStateReducer(
  state: MiningState,
  action: MiningAction,
): MiningState {
  switch (action.type) {
    case "START_MINING":
      return {
        ...state,
        isRunning: true,
        stats: {
          ...state.stats,
          startTime: action.startTime,
          workersActive: action.workerCount,
          totalHashes: 0,
          totalHashRate: 0,
          elapsedTime: 0,
        },
      };

    case "STOP_MINING":
      return {
        ...state,
        isRunning: false,
        stats: {
          ...state.stats,
          workersActive: 0,
        },
      };

    case "UPDATE_PROGRESS":
      const progressIncrement = state.config.progressReportInterval;
      const newTotalHashes = state.stats.totalHashes + progressIncrement;
      const currentTime = Date.now();
      const elapsedTime = currentTime - state.stats.startTime;
      const newHashRate = elapsedTime > 0
        ? Math.round(newTotalHashes / (elapsedTime / 1000))
        : 0;

      return {
        ...state,
        stats: {
          ...state.stats,
          totalHashes: newTotalHashes,
          totalHashRate: newHashRate,
          elapsedTime,
        },
      };

    case "WORKER_EXHAUSTED":
      return {
        ...state,
        stats: {
          ...state.stats,
          workersActive: Math.max(0, state.stats.workersActive - 1),
        },
        workers: state.workers.map((worker) =>
          worker.id === action.workerId ? { ...worker, active: false } : worker
        ),
      };

    case "WORKER_ERROR":
      return {
        ...state,
        stats: {
          ...state.stats,
          workersActive: Math.max(0, state.stats.workersActive - 1),
        },
        workers: state.workers.map((worker) =>
          worker.id === action.workerId ? { ...worker, active: false } : worker
        ),
      };

    case "BLOCK_FOUND":
      return {
        ...state,
        isRunning: false,
        stats: {
          ...state.stats,
          workersActive: 0,
        },
      };

    default:
      return state;
  }
}

export function addWorker(
  state: MiningState,
  workerInfo: WorkerInfo,
): MiningState {
  return {
    ...state,
    workers: [...state.workers, workerInfo],
  };
}

export function removeAllWorkers(state: MiningState): MiningState {
  return {
    ...state,
    workers: [],
    stats: {
      ...state.stats,
      workersActive: 0,
    },
  };
}

export function getActiveWorkers(state: MiningState): WorkerInfo[] {
  return state.workers.filter((worker) => worker.active);
}

export function getWorkerById(
  state: MiningState,
  workerId: number,
): WorkerInfo | undefined {
  return state.workers.find((worker) => worker.id === workerId);
}

export function updateStats(
  state: MiningState,
  updater: (stats: MiningStats) => MiningStats,
): MiningState {
  return {
    ...state,
    stats: updater(state.stats),
  };
}

export function isAllWorkersExhausted(state: MiningState): boolean {
  return state.workers.length > 0 &&
    !state.workers.some((worker) => worker.active);
}

export function calculateProgress(state: MiningState): {
  totalAttempts: number;
  hashRate: number;
  elapsedSeconds: number;
  workersActive: number;
} {
  const elapsedSeconds = state.stats.elapsedTime / 1000;

  return {
    totalAttempts: state.stats.totalHashes,
    hashRate: state.stats.totalHashRate,
    elapsedSeconds: Math.round(elapsedSeconds),
    workersActive: state.stats.workersActive,
  };
}
