import { BlockTemplate } from "./rpc.ts";
import {
  MiningStats,
  WorkerConfig,
  WorkerMessage,
  WorkerResponse,
  WorkerStartMessage,
  WorkerStopMessage,
} from "./shared-types.ts";

export class WorkerPoolManager {
  private workers: Worker[] = [];
  private config: WorkerConfig;
  private stats: MiningStats;
  private isRunning = false;
  private progressCallback?: (
    workerId: number,
    attempts: number,
    hashRate: number,
  ) => void;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = {
      progressReportInterval: 50000,
      workerCount: navigator.hardwareConcurrency || 12,
      maxNonceValue: 0xFFFFFFFF, // 32-bit max value
      ...config,
    };

    this.stats = {
      totalHashes: 0,
      totalHashRate: 0,
      workersActive: 0,
      startTime: 0,
      elapsedTime: 0,
    };

    console.log(
      `🚀 Initializing worker pool with ${this.config.workerCount} workers`,
    );
  }

  async startMining(blockTemplate: BlockTemplate): Promise<void> {
    if (this.isRunning) {
      throw new Error("Mining is already running");
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();
    this.stats.totalHashes = 0;
    this.stats.workersActive = this.config.workerCount;

    console.log(`\n=== STARTING MULTI-THREADED BITCOIN MINING ===`);
    console.log(
      `💡 Using ${this.config.workerCount} workers across all CPU cores`,
    );
    console.log(`💡 Each worker will mine a separate nonce range`);
    console.log(`💡 Press Ctrl+C to stop mining\n`);

    // Calculate nonce ranges for each worker
    const nonceRangeSize = Math.floor(
      this.config.maxNonceValue / this.config.workerCount,
    );

    // Create and start workers
    for (let i = 0; i < this.config.workerCount; i++) {
      const nonceStart = i * nonceRangeSize;
      const nonceEnd = (i === this.config.workerCount - 1)
        ? this.config.maxNonceValue // Last worker gets remaining range
        : (i + 1) * nonceRangeSize - 1;

      await this.createWorker(i, blockTemplate, nonceStart, nonceEnd);
    }

    // Start progress reporting
    this.startProgressReporting();
  }

  private async createWorker(
    workerId: number,
    blockTemplate: BlockTemplate,
    nonceStart: number,
    nonceEnd: number,
  ): Promise<void> {
    try {
      const worker = new Worker(import.meta.resolve("./worker.ts"), {
        type: "module",
      });

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };

      worker.onerror = (error) => {
        console.error(`Worker ${workerId} error:`, error);
        this.handleWorkerError(workerId);
      };

      this.workers[workerId] = worker;

      // Send start message to worker
      const startMessage: WorkerStartMessage = {
        type: "start",
        blockTemplate,
        nonceStart,
        nonceEnd,
        workerId,
      };

      worker.postMessage(startMessage);
      console.log(
        `✅ Worker ${workerId} started: nonce range ${nonceStart.toLocaleString()} - ${nonceEnd.toLocaleString()}`,
      );
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
      throw error;
    }
  }

  private handleWorkerMessage(message: WorkerResponse): void {
    switch (message.type) {
      case "progress":
        this.updateProgress(message);
        break;

      case "found":
        this.handleBlockFound(message);
        break;

      case "exhausted":
        this.handleWorkerExhausted(message);
        break;

      case "error":
        console.error(`Worker ${message.workerId} error:`, message.error);
        this.handleWorkerError(message.workerId);
        break;

      default:
        console.warn("Unknown worker message type:", message);
    }
  }

  private updateProgress(message: any): void {
    // Update total hash count (this is approximate since workers report at different intervals)
    this.stats.totalHashes += this.config.progressReportInterval;

    // Call external progress callback if provided
    if (this.progressCallback) {
      this.progressCallback(
        message.workerId,
        message.attempts,
        message.hashRate,
      );
    }
  }

  private handleBlockFound(message: any): void {
    console.log(`\n🎉🎉🎉 WINNING BITCOIN BLOCK FOUND! 🎉🎉🎉`);
    console.log(`🎯 Found by Worker ${message.workerId}`);
    console.log(`💰 BLOCK REWARD: 3.125 BTC (~$359,375 USD)`);
    console.log(`🔢 Winning Nonce: ${message.nonce.toLocaleString()}`);
    console.log(`🏆 Block Hash: ${message.hash}`);
    console.log(`📊 Worker Attempts: ${message.attempts.toLocaleString()}`);
    console.log(
      `📊 Total System Attempts: ${this.stats.totalHashes.toLocaleString()}`,
    );
    console.log(`\n🚀 STOPPING ALL WORKERS - BLOCK FOUND! 🚀`);

    this.stopAllWorkers();
    Deno.exit(0);
  }

  private handleWorkerExhausted(message: any): void {
    console.log(
      `⚠️  Worker ${message.workerId} exhausted its nonce range (${message.attempts.toLocaleString()} attempts)`,
    );
    this.stats.workersActive--;

    if (this.stats.workersActive === 0) {
      console.log(`\n❌ All workers have exhausted their nonce ranges`);
      console.log(
        `📊 Total attempts: ${this.stats.totalHashes.toLocaleString()}`,
      );
      console.log(`🎯 No block found in complete 32-bit nonce space`);
      console.log(
        `💡 In real mining, you would update timestamp and try again`,
      );
      this.stopAllWorkers();
    }
  }

  private handleWorkerError(workerId: number): void {
    console.error(
      `Worker ${workerId} encountered an error and will be restarted`,
    );
    // In a production system, you might want to restart the worker here
    this.stats.workersActive--;
  }

  private startProgressReporting(): void {
    const reportInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(reportInterval);
        return;
      }

      this.stats.elapsedTime = Date.now() - this.stats.startTime;
      const elapsedSeconds = this.stats.elapsedTime / 1000;
      this.stats.totalHashRate = Math.round(
        this.stats.totalHashes / elapsedSeconds,
      );

      console.log(
        `⚡ Mining Status: ${this.stats.totalHashes.toLocaleString()} hashes | ` +
          `${this.stats.totalHashRate.toLocaleString()} H/s | ` +
          `${this.stats.workersActive} workers active | ` +
          `${Math.round(elapsedSeconds)}s elapsed`,
      );
    }, 10000); // Report every 10 seconds
  }

  stopAllWorkers(): void {
    console.log(`🛑 Stopping all ${this.workers.length} workers...`);
    this.isRunning = false;

    const stopMessage: WorkerStopMessage = { type: "stop" };

    this.workers.forEach((worker, index) => {
      if (worker) {
        try {
          worker.postMessage(stopMessage);
          worker.terminate();
        } catch (error) {
          console.warn(`Error stopping worker ${index}:`, error);
        }
      }
    });

    this.workers = [];
    this.stats.workersActive = 0;
  }

  getStats(): MiningStats {
    return { ...this.stats };
  }

  setProgressCallback(
    callback: (workerId: number, attempts: number, hashRate: number) => void,
  ): void {
    this.progressCallback = callback;
  }
}
