export interface MiningStats {
  totalHashes: number;
  totalHashRate: number;
  workersActive: number;
  startTime: number;
  elapsedTime: number;
}

export interface WorkerConfig {
  progressReportInterval: number;
  workerCount: number;
  maxNonceValue: number;
}

export interface MiningConfig {
  workerCount: number;
  progressReportInterval: number;
  maxNonceValue: number;
  progressReportingIntervalMs: number;
}

export interface NonceRange {
  start: number;
  end: number;
}

export interface WorkerInfo {
  id: number;
  range: NonceRange;
  worker: Worker;
  active: boolean;
}

export interface MiningState {
  stats: MiningStats;
  workers: WorkerInfo[];
  isRunning: boolean;
  config: MiningConfig;
}

export type MiningAction =
  | { type: "START_MINING"; startTime: number; workerCount: number }
  | { type: "STOP_MINING" }
  | { type: "UPDATE_PROGRESS"; workerId: number; attempts: number }
  | { type: "WORKER_EXHAUSTED"; workerId: number }
  | { type: "WORKER_ERROR"; workerId: number }
  | { type: "BLOCK_FOUND"; workerId: number; attempts: number };
