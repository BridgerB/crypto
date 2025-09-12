// src/index.js - Enhanced with improved console output
import { fork } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import { RPC } from "./rpc.js";
import { db } from "../db/index.js";
import { block } from "../db/schema.js";
import { and, gte, lte } from "drizzle-orm";

// Get the directory name using ES modules approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get base directory from environment or use current directory
const BASE_DIR = process.env.BTC_ETL_BASE_DIR || path.resolve(__dirname, "..");

// Calculate absolute worker path
const WORKER_PATH = path.resolve(BASE_DIR, "src", "worker.js");

// Verify the worker path exists
if (!fs.existsSync(WORKER_PATH)) {
  console.error(`ERROR: Worker file not found: ${WORKER_PATH}`);
  console.error(`Current directory: ${process.cwd()}`);
  console.error(`__dirname: ${__dirname}`);
  console.error(`BASE_DIR: ${BASE_DIR}`);
  process.exit(1);
}

class BitcoinETL {
  constructor(config = {}) {
    this.rpc = new RPC();
    this.workerPath = WORKER_PATH;
    this.verbose = config.verbose || false;
    this.workers = [];
    this.activeWorkers = 0;
    this.maxWorkers = config.maxWorkers || Math.max(1, os.cpus().length - 1);
    this.batchSize = config.batchSize || 50;
    this.results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
    this.startTime = 0;
    this.completedBlocks = new Set();
    this.existingBlocks = new Set();
    this.blocksToProcess = [];
    this.currentIndex = 0;
    this.isShuttingDown = false;
    this.summaryPrinted = false;
    this.blockHashCache = new Map();
    this.prefetchedBlocks = new Map();
    this.lastProgressUpdate = 0;
    this.progressUpdateInterval = 5000; // Update every 5 seconds for cleaner output
    this.prefetchInProgress = false;
    this.totalBlocksToProcess = 0;
    this.processingRates = []; // Track processing rates for better ETA
    this.lastStatsUpdate = 0;
    this.recentBlockTimes = []; // Track recent block processing times
    this.workerStats = new Map(); // Track individual worker performance
  }

  /**
   * Simple logging utility
   */
  log(level, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;

    switch (level) {
      case "info":
        console.log(`${prefix} INFO: ${message}`);
        break;
      case "success":
        console.log(`${prefix} SUCCESS: ${message}`);
        break;
      case "warning":
        console.log(`${prefix} WARNING: ${message}`);
        break;
      case "error":
        console.log(`${prefix} ERROR: ${message}`);
        break;
      case "processing":
        console.log(`${prefix} PROCESSING: ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }

    if (data && this.verbose) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Display simple progress statistics
   */
  displayDetailedStats() {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const completedBlocks = this.results.success + this.results.failed;

    if (completedBlocks === 0) return;

    // Calculate current processing rate
    const currentRate = (completedBlocks / elapsed) * 1000; // blocks per second

    // Calculate progress percentage
    const progress = this.totalBlocksToProcess > 0
      ? (completedBlocks / this.totalBlocksToProcess) * 100
      : 0;

    // Simple progress output
    console.log(
      `\nProgress: ${completedBlocks}/${this.totalBlocksToProcess} blocks (${
        progress.toFixed(
          1,
        )
      }%)`,
    );
    console.log(
      `Rate: ${
        currentRate.toFixed(
          2,
        )
      } blocks/sec, Success: ${this.results.success}, Failed: ${this.results.failed}`,
    );
    console.log(`Active Workers: ${this.activeWorkers}/${this.maxWorkers}`);

    if (this.results.errors.length > 0) {
      console.log(`Recent errors: ${this.results.errors.length}`);
    }
  }

  /**
   * Check which blocks already exist in the database
   */
  async checkExistingBlocks(startHeight, endHeight) {
    this.log(
      "info",
      `Checking for existing blocks in range ${startHeight.toLocaleString()} to ${endHeight.toLocaleString()}...`,
    );

    try {
      const existingBlocks = await db
        .select({ blockHeight: block.blockHeight })
        .from(block)
        .where(
          and(
            gte(block.blockHeight, startHeight),
            lte(block.blockHeight, endHeight),
          ),
        );

      const existingSet = new Set(existingBlocks.map((b) => b.blockHeight));

      this.log(
        "success",
        `Found ${existingSet.size.toLocaleString()} existing blocks in database`,
      );

      if (this.verbose && existingSet.size > 0) {
        const sortedExisting = Array.from(existingSet).sort((a, b) => a - b);
        this.log(
          "info",
          `Existing range: ${sortedExisting[0].toLocaleString()} to ${
            sortedExisting[
              sortedExisting.length - 1
            ].toLocaleString()
          }`,
        );
      }

      return existingSet;
    } catch (error) {
      this.log("error", `Error checking existing blocks: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Initialize the blocks to process, skipping existing ones
   */
  async initializeBlocksToProcess(startHeight, endHeight) {
    this.existingBlocks = await this.checkExistingBlocks(
      startHeight,
      endHeight,
    );

    this.blocksToProcess = [];
    for (let height = startHeight; height <= endHeight; height++) {
      if (!this.existingBlocks.has(height)) {
        this.blocksToProcess.push(height);
      }
    }

    this.totalBlocksToProcess = this.blocksToProcess.length;
    this.currentIndex = 0;

    const totalRequested = endHeight - startHeight + 1;
    const alreadyExists = this.existingBlocks.size;
    const needsProcessing = this.blocksToProcess.length;

    console.log();
    console.log("=== PROCESSING SUMMARY ===");
    console.log(`Total requested: ${totalRequested.toLocaleString()} blocks`);
    console.log(`Already exist: ${alreadyExists.toLocaleString()} blocks`);
    console.log(`Need processing: ${needsProcessing.toLocaleString()} blocks`);
    console.log();

    if (needsProcessing === 0) {
      this.log(
        "success",
        `All blocks in range ${startHeight.toLocaleString()} to ${endHeight.toLocaleString()} already exist. Nothing to process.`,
      );
      return false;
    }

    if (alreadyExists > 0) {
      this.log(
        "info",
        `Resuming from where we left off - skipping ${alreadyExists.toLocaleString()} existing blocks`,
      );
    }

    return true;
  }

  hasMoreBlocks() {
    return this.currentIndex < this.blocksToProcess.length;
  }

  getRemainingBlockCount() {
    return Math.max(0, this.blocksToProcess.length - this.currentIndex);
  }

  getNextBlockHeight() {
    if (this.hasMoreBlocks()) {
      return this.blocksToProcess[this.currentIndex++];
    }
    return null;
  }

  async prefetchBlocks(startIndex, count) {
    if (this.prefetchInProgress || this.isShuttingDown) {
      return;
    }

    this.prefetchInProgress = true;

    try {
      const endIndex = Math.min(
        startIndex + count - 1,
        this.blocksToProcess.length - 1,
      );
      if (endIndex < startIndex) {
        this.prefetchInProgress = false;
        return;
      }

      const heightsToFetch = this.blocksToProcess.slice(
        startIndex,
        endIndex + 1,
      );

      if (this.verbose) {
        this.log(
          "info",
          `Prefetching ${heightsToFetch.length} blocks: ${
            heightsToFetch[0].toLocaleString()
          } to ${heightsToFetch[heightsToFetch.length - 1].toLocaleString()}`,
        );
      }

      const blockHashes = await this.rpc.getBlockHashesBatch(
        heightsToFetch[0],
        heightsToFetch[heightsToFetch.length - 1],
      );

      heightsToFetch.forEach((height, i) => {
        if (blockHashes[i]) {
          this.blockHashCache.set(height, blockHashes[i]);
        }
      });

      const validHashes = blockHashes.filter((hash) => hash);
      const blocks = await this.rpc.getBlocksBatch(validHashes, 2);

      heightsToFetch.forEach((height, i) => {
        if (blocks[i]) {
          this.prefetchedBlocks.set(height, blocks[i]);
        }
      });

      if (this.verbose) {
        this.log("success", `Successfully prefetched ${blocks.length} blocks`);
      }
    } catch (error) {
      this.log("error", `Error prefetching blocks: ${error.message}`);
    } finally {
      this.prefetchInProgress = false;
    }
  }

  async getBlockData(blockHeight) {
    if (this.prefetchedBlocks.has(blockHeight)) {
      const blockData = this.prefetchedBlocks.get(blockHeight);
      this.prefetchedBlocks.delete(blockHeight);
      return blockData;
    }

    let blockHash = this.blockHashCache.get(blockHeight);
    if (!blockHash) {
      blockHash = await this.rpc.getBlockHash(blockHeight);
    }

    return await this.rpc.getBlock(blockHash, 2);
  }

  initWorkers() {
    this.log("info", `Initializing ${this.maxWorkers} worker processes...`);

    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        const worker = fork(this.workerPath, [], {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
          env: {
            ...process.env,
            WORKER_ID: i,
          },
        });

        // Initialize worker stats
        this.workerStats.set(i, {
          blocksProcessed: 0,
          totalTime: 0,
          errors: 0,
        });

        worker.on("message", (message) => {
          this.handleWorkerMessage(worker, message, i);
        });

        worker.on("error", (error) => {
          this.log("error", `Worker ${i} error: ${error.message}`);
          this.results.failed++;
          worker.busy = false;
          this.activeWorkers--;
          this.workerStats.get(i).errors++;
          this.checkCompletion();
        });

        worker.on("exit", (code) => {
          if (code !== 0 && !this.isShuttingDown) {
            this.log("error", `Worker ${i} exited with code ${code}`);
          }

          if (worker.busy) {
            worker.busy = false;
            this.activeWorkers--;
          }

          if (this.hasMoreBlocks() && !this.isShuttingDown) {
            // Restart worker logic remains the same
            const index = this.workers.indexOf(worker);
            if (index > -1) {
              try {
                const newWorker = fork(this.workerPath, [], {
                  stdio: ["pipe", "pipe", "pipe", "ipc"],
                  env: {
                    ...process.env,
                    WORKER_ID: index,
                  },
                });

                newWorker.on("message", (message) => {
                  this.handleWorkerMessage(newWorker, message, index);
                });

                newWorker.on("error", (error) => {
                  this.log("error", `Worker ${index} error: ${error.message}`);
                  this.results.failed++;
                  newWorker.busy = false;
                  this.activeWorkers--;
                  this.checkCompletion();
                });

                this.workers[index] = newWorker;
              } catch (error) {
                this.log(
                  "error",
                  `Failed to replace worker ${index}: ${error.message}`,
                );
              }
            }
          }

          if (!this.isShuttingDown) {
            this.processNextBlock();
            this.checkCompletion();
          }
        });

        worker.busy = false;
        this.workers.push(worker);
      } catch (error) {
        this.log("error", `Failed to initialize worker ${i}: ${error.message}`);
      }
    }
  }

  handleWorkerMessage(worker, message, workerId) {
    if (message.type === "result") {
      const result = message.data;

      if (result.success && result.result && result.result.success) {
        const blockHeight = result.result.blockHeight;
        this.completedBlocks.add(blockHeight);
        this.results.success++;

        const blockTime = Date.now() - worker.startTime;

        // Update worker stats
        const stats = this.workerStats.get(workerId);
        if (stats) {
          stats.blocksProcessed++;
          stats.totalTime += blockTime;
        }

        // Track recent block times for rate calculation
        this.recentBlockTimes.push({ time: Date.now(), duration: blockTime });
        if (this.recentBlockTimes.length > 20) {
          this.recentBlockTimes.shift();
        }

        if (this.verbose) {
          this.log(
            "success",
            `Block ${blockHeight.toLocaleString()} processed in ${blockTime}ms by worker ${workerId}`,
          );
        }
      } else {
        this.results.failed++;
        const errorMsg = result.error ||
          (result.result ? result.result.error : "Unknown error");
        this.results.errors.push(errorMsg);

        if (result.result && result.result.blockHeight) {
          this.log(
            "error",
            `Block ${result.result.blockHeight.toLocaleString()} failed: ${errorMsg}`,
          );
        } else {
          this.log("error", `Block processing failed: ${errorMsg}`);
        }
      }

      worker.busy = false;
      this.activeWorkers--;

      if (!this.isShuttingDown) {
        this.processNextBlock();
        this.checkCompletion();
      }

      this.updateProgress();
    } else if (message.type === "error") {
      this.log("error", `Worker error: ${message.data.message}`);
      this.results.failed++;
      worker.busy = false;
      this.activeWorkers--;

      if (!this.isShuttingDown) {
        this.processNextBlock();
        this.checkCompletion();
      }
    }
  }

  updateProgress() {
    const now = Date.now();

    if (now - this.lastProgressUpdate < this.progressUpdateInterval) {
      return;
    }

    this.lastProgressUpdate = now;
    this.displayDetailedStats();

    // Trigger prefetch if needed
    const remainingCached = this.prefetchedBlocks.size;
    const remainingBlocks = this.getRemainingBlockCount();

    if (
      remainingCached < this.batchSize &&
      remainingBlocks > 0 &&
      !this.prefetchInProgress
    ) {
      this.prefetchBlocks(
        this.currentIndex,
        Math.min(this.batchSize, remainingBlocks),
      );
    }
  }

  async processNextBlock() {
    if (!this.hasMoreBlocks() || this.isShuttingDown) {
      this.checkCompletion();
      return;
    }

    let worker = null;
    for (const w of this.workers) {
      if (!w.busy) {
        worker = w;
        break;
      }
    }

    if (!worker) {
      return;
    }

    const blockHeight = this.getNextBlockHeight();
    if (blockHeight === null) {
      this.checkCompletion();
      return;
    }

    try {
      const blockData = await this.getBlockData(blockHeight);

      worker.busy = true;
      worker.startTime = Date.now();
      this.activeWorkers++;

      worker.send({
        cmd: "process_block_data",
        data: {
          blockHeight,
          blockData,
          verbose: this.verbose,
        },
      });
    } catch (error) {
      this.log(
        "error",
        `Error getting block data for height ${blockHeight.toLocaleString()}: ${error.message}`,
      );
      this.results.failed++;
      this.results.errors.push(
        `Failed to get block ${blockHeight}: ${error.message}`,
      );

      if (!this.isShuttingDown) {
        this.processNextBlock();
        this.checkCompletion();
      }
    }
  }

  checkCompletion() {
    if (this.isShuttingDown) {
      return;
    }

    if (
      !this.hasMoreBlocks() &&
      this.activeWorkers === 0 &&
      !this.summaryPrinted
    ) {
      this.isShuttingDown = true;
      this.summaryPrinted = true;

      this.log("success", "All blocks processed, generating final summary...");
      this.printFinalSummary();
      this.cleanup();

      setTimeout(() => {
        process.exit(0);
      }, 500);
    }
  }

  printFinalSummary() {
    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const processedBlocks = this.results.success + this.results.failed;
    const blocksPerSecond = (processedBlocks / totalTime).toFixed(2);

    console.log("\n=== FINAL SUMMARY ===");
    console.log(
      `Total blocks requested: ${
        this.totalBlocksToProcess + this.existingBlocks.size
      }`,
    );
    console.log(`Already existed: ${this.existingBlocks.size}`);
    console.log(
      `Processed: ${processedBlocks} in ${totalTime}s (${blocksPerSecond} blocks/sec)`,
    );
    console.log(
      `Success: ${this.results.success}, Failed: ${this.results.failed}`,
    );

    if (this.results.errors.length > 0) {
      console.log(`Total errors: ${this.results.errors.length}`);
    }

    this.log("success", "ETL processing completed successfully!");

    if (this.results.failed > 0) {
      this.log(
        "warning",
        "Consider re-running failed blocks. Use: node src/index.js <start> <end> to retry specific ranges.",
      );
    }
  }

  cleanup() {
    this.log("info", `Cleaning up ${this.workers.length} workers...`);

    if (this.rpc) {
      this.rpc.destroy();
    }

    for (const worker of this.workers) {
      if (worker.connected) {
        worker.kill();
      }
    }

    this.isShuttingDown = true;
    this.blockHashCache.clear();
    this.prefetchedBlocks.clear();
    this.completedBlocks.clear();
    this.existingBlocks.clear();
  }

  async processBlockRange(startHeight, endHeight) {
    console.log();
    console.log("=== BITCOIN ETL PROCESSOR ===");

    this.log(
      "info",
      `Processing blocks ${startHeight.toLocaleString()} to ${endHeight.toLocaleString()} with ${this.maxWorkers} workers...`,
    );
    this.startTime = Date.now();

    const hasBlocksToProcess = await this.initializeBlocksToProcess(
      startHeight,
      endHeight,
    );

    if (!hasBlocksToProcess) {
      this.log("success", "No blocks to process. Exiting.");
      this.cleanup();
      setTimeout(() => {
        process.exit(0);
      }, 100);
      return;
    }

    if (this.totalBlocksToProcess > 10000) {
      this.log(
        "warning",
        `Processing a large range of ${this.totalBlocksToProcess.toLocaleString()} blocks. This may take significant time.`,
      );
    }

    this.initWorkers();

    // Start initial prefetch
    const initialPrefetchCount = Math.min(
      this.batchSize,
      this.totalBlocksToProcess,
    );
    await this.prefetchBlocks(0, initialPrefetchCount);

    // Start processing blocks
    for (let i = 0; i < this.maxWorkers && this.hasMoreBlocks(); i++) {
      this.processNextBlock();
    }

    // Show initial progress immediately
    setTimeout(() => {
      this.displayDetailedStats();
    }, 1000);
  }

  async validateBlockRange(startHeight, endHeight) {
    try {
      await this.rpc.getBlockHash(startHeight);
      await this.rpc.getBlockHash(endHeight);
      return true;
    } catch (error) {
      this.log("error", `Invalid block range: ${error.message}`);
      return false;
    }
  }

  async getTipBlockHeight() {
    try {
      const info = await this.rpc.getBlockchainInfo();
      return info.blocks;
    } catch (error) {
      this.log("error", `Error getting tip block height: ${error.message}`);
      throw error;
    }
  }
}

// Handle process signals
process.on("SIGINT", () => {
  console.log("\nWARNING: Received SIGINT signal. Shutting down gracefully...");
  console.log("Please wait for workers to finish current blocks...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(
    "\nWARNING: Received SIGTERM signal. Shutting down gracefully...",
  );
  process.exit(0);
});

async function main() {
  const args = process.argv.slice(2);
  let startHeight,
    endHeight,
    numWorkers,
    batchSize,
    verbose = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verbose" || args[i] === "-v") {
      verbose = true;
    } else if (args[i] === "--workers" || args[i] === "-w") {
      numWorkers = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--batch-size" || args[i] === "-b") {
      batchSize = parseInt(args[i + 1]);
      i++;
    } else if (startHeight === undefined && !isNaN(parseInt(args[i]))) {
      startHeight = parseInt(args[i]);
    } else if (endHeight === undefined && !isNaN(parseInt(args[i]))) {
      endHeight = parseInt(args[i]);
    }
  }

  if (!numWorkers || isNaN(numWorkers)) {
    numWorkers = Math.max(1, os.cpus().length - 1);
  }

  if (!batchSize || isNaN(batchSize)) {
    batchSize = 50;
  }

  if (startHeight === undefined || isNaN(startHeight)) {
    console.error("ERROR: Please provide a valid start block height");
    console.log(
      "Usage: node src/index.js <start_height> [end_height] [--verbose|-v] [--workers|-w <num_workers>] [--batch-size|-b <batch_size>]",
    );
    process.exit(1);
  }

  if (endHeight === undefined) {
    endHeight = startHeight;
  }

  if (endHeight < startHeight) {
    console.error(
      "ERROR: End height must be greater than or equal to start height",
    );
    process.exit(1);
  }

  try {
    const etl = new BitcoinETL({
      verbose,
      maxWorkers: numWorkers,
      batchSize,
    });

    console.log();
    console.log("=== CONFIGURATION ===");
    console.log(`Workers: ${numWorkers}`);
    console.log(`Batch size: ${batchSize}`);
    console.log(`Verbose: ${verbose}`);
    console.log(
      `Block range: ${startHeight.toLocaleString()} to ${endHeight.toLocaleString()}`,
    );
    console.log();

    const isValid = await etl.validateBlockRange(startHeight, endHeight);
    if (!isValid) {
      console.error(
        "ERROR: Invalid block range. Please check the block heights.",
      );
      process.exit(1);
    }

    await etl.processBlockRange(startHeight, endHeight);
  } catch (error) {
    console.error(`ERROR: Fatal error: ${error.message}`);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
