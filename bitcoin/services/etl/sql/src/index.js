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

// Console styling utilities
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

const symbols = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  processing: "⚡",
  time: "⏱",
  blocks: "▓",
  arrow: "→",
  bullet: "•",
  progress: "█",
  progressEmpty: "░",
};

// Verify the worker path exists
if (!fs.existsSync(WORKER_PATH)) {
  console.error(
    `${colors.red}${symbols.error} Worker file not found: ${WORKER_PATH}${colors.reset}`,
  );
  console.error(
    `${colors.gray}Current directory: ${process.cwd()}${colors.reset}`,
  );
  console.error(`${colors.gray}__dirname: ${__dirname}${colors.reset}`);
  console.error(`${colors.gray}BASE_DIR: ${BASE_DIR}${colors.reset}`);
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
   * Enhanced logging utility
   */
  log(level, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `${colors.gray}[${timestamp}]${colors.reset}`;

    switch (level) {
      case "info":
        console.log(
          `${prefix} ${colors.blue}${symbols.info}${colors.reset} ${message}`,
        );
        break;
      case "success":
        console.log(
          `${prefix} ${colors.green}${symbols.success}${colors.reset} ${message}`,
        );
        break;
      case "warning":
        console.log(
          `${prefix} ${colors.yellow}${symbols.warning}${colors.reset} ${message}`,
        );
        break;
      case "error":
        console.log(
          `${prefix} ${colors.red}${symbols.error}${colors.reset} ${message}`,
        );
        break;
      case "processing":
        console.log(
          `${prefix} ${colors.cyan}${symbols.processing}${colors.reset} ${message}`,
        );
        break;
      default:
        console.log(`${prefix} ${message}`);
    }

    if (data && this.verbose) {
      console.log(
        `${colors.gray}${JSON.stringify(data, null, 2)}${colors.reset}`,
      );
    }
  }

  /**
   * Display a formatted header
   */
  displayHeader(title) {
    const width = 80;
    const padding = Math.max(0, Math.floor((width - title.length - 2) / 2));
    const line = "═".repeat(width);
    const titleLine = "═".repeat(padding) + ` ${title} ` + "═".repeat(padding);

    console.log(`\n${colors.cyan}${colors.bright}${line}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}${titleLine}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}${line}${colors.reset}\n`);
  }

  /**
   * Display a progress bar
   */
  getProgressBar(current, total, width = 40) {
    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;

    const bar = colors.green +
      symbols.progress.repeat(filled) +
      colors.gray +
      symbols.progressEmpty.repeat(empty) +
      colors.reset;

    return `[${bar}] ${percentage.toFixed(1)}%`;
  }

  /**
   * Format time duration
   */
  formatDuration(milliseconds) {
    if (milliseconds < 1000) return `${milliseconds}ms`;

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Format numbers with proper units
   */
  formatNumber(num) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  /**
   * Calculate and display detailed statistics
   */
  displayDetailedStats() {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const completedBlocks = this.results.success + this.results.failed;

    if (completedBlocks === 0) return;

    // Calculate current processing rate
    const currentRate = (completedBlocks / elapsed) * 1000; // blocks per second
    this.processingRates.push({
      time: now,
      rate: currentRate,
      completed: completedBlocks,
    });

    // Keep only last 10 rate measurements for smoothing
    if (this.processingRates.length > 10) {
      this.processingRates.shift();
    }

    // Calculate average rate over recent measurements
    const recentRates = this.processingRates.slice(-5);
    const avgRate = recentRates.reduce((sum, r) => sum + r.rate, 0) /
      recentRates.length;

    // Calculate ETA
    const remainingBlocks = this.totalBlocksToProcess - completedBlocks;
    const etaMs = remainingBlocks > 0 ? (remainingBlocks / avgRate) * 1000 : 0;
    const etaDate = new Date(now + etaMs);

    // Calculate progress percentage
    const progress = this.totalBlocksToProcess > 0
      ? (completedBlocks / this.totalBlocksToProcess) * 100
      : 0;

    // Clear previous lines and display stats
    process.stdout.write("\x1b[2J\x1b[H"); // Clear screen and move cursor to top

    this.displayHeader("BITCOIN ETL PROCESSING STATUS");

    // Main progress section
    console.log(`${colors.bright}${symbols.blocks} PROGRESS${colors.reset}`);
    console.log(
      `   ${this.getProgressBar(completedBlocks, this.totalBlocksToProcess)}`,
    );
    console.log(
      `   ${colors.cyan}${completedBlocks.toLocaleString()}${colors.reset} / ${colors.cyan}${this.totalBlocksToProcess.toLocaleString()}${colors.reset} blocks processed`,
    );
    console.log();

    // Performance metrics
    console.log(
      `${colors.bright}${symbols.processing} PERFORMANCE${colors.reset}`,
    );
    console.log(
      `   Current Rate: ${colors.green}${
        avgRate.toFixed(2)
      } blocks/sec${colors.reset}`,
    );
    console.log(
      `   Success Rate: ${colors.green}${this.results.success.toLocaleString()}${colors.reset} blocks`,
    );
    if (this.results.failed > 0) {
      console.log(
        `   Failed:       ${colors.red}${this.results.failed.toLocaleString()}${colors.reset} blocks`,
      );
    }
    console.log(
      `   Active Workers: ${colors.yellow}${this.activeWorkers}${colors.reset} / ${colors.yellow}${this.maxWorkers}${colors.reset}`,
    );
    console.log();

    // Time information
    console.log(
      `${colors.bright}${symbols.time} TIME INFORMATION${colors.reset}`,
    );
    console.log(
      `   Elapsed: ${colors.cyan}${
        this.formatDuration(elapsed)
      }${colors.reset}`,
    );
    if (etaMs > 0) {
      console.log(
        `   ETA: ${colors.cyan}${this.formatDuration(etaMs)}${colors.reset}`,
      );
      console.log(
        `   Completion: ${colors.cyan}${etaDate.toLocaleString()}${colors.reset}`,
      );
    }
    console.log();

    // Worker performance (if verbose)
    if (this.verbose && this.workerStats.size > 0) {
      console.log(
        `${colors.bright}${symbols.info} WORKER STATS${colors.reset}`,
      );
      for (const [workerId, stats] of this.workerStats) {
        const avgTime = stats.totalTime / stats.blocksProcessed;
        console.log(
          `   Worker ${workerId}: ${stats.blocksProcessed} blocks, ${
            avgTime.toFixed(0)
          }ms avg`,
        );
      }
      console.log();
    }

    // Memory and cache info
    const memUsed = process.memoryUsage();
    console.log(`${colors.bright}${symbols.info} SYSTEM INFO${colors.reset}`);
    console.log(
      `   Memory: ${colors.cyan}${
        (memUsed.heapUsed / 1024 / 1024).toFixed(1)
      }MB${colors.reset} used`,
    );
    console.log(
      `   Cached Blocks: ${colors.cyan}${this.prefetchedBlocks.size}${colors.reset}`,
    );
    console.log(
      `   Cache Hit Rate: ${colors.cyan}${
        ((this.blockHashCache.size / Math.max(1, completedBlocks)) * 100)
          .toFixed(1)
      }%${colors.reset}`,
    );
    console.log();

    // Recent errors (if any)
    if (this.results.errors.length > 0) {
      console.log(
        `${colors.bright}${colors.red}${symbols.warning} RECENT ERRORS${colors.reset}`,
      );
      const recentErrors = this.results.errors.slice(-3);
      recentErrors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${colors.red}${error}${colors.reset}`);
      });
      if (this.results.errors.length > 3) {
        console.log(
          `   ${colors.gray}... and ${
            this.results.errors.length - 3
          } more${colors.reset}`,
        );
      }
      console.log();
    }

    // Display current processing range
    if (
      this.blocksToProcess.length > 0 &&
      this.currentIndex < this.blocksToProcess.length
    ) {
      const currentBlock = this.blocksToProcess[this.currentIndex - 1];
      const nextBlocks = this.blocksToProcess.slice(
        this.currentIndex,
        this.currentIndex + 5,
      );

      console.log(
        `${colors.bright}${symbols.arrow} CURRENT PROCESSING${colors.reset}`,
      );
      if (currentBlock) {
        console.log(
          `   Current: ${colors.yellow}Block ${currentBlock.toLocaleString()}${colors.reset}`,
        );
      }
      if (nextBlocks.length > 0) {
        console.log(
          `   Next: ${colors.gray}${
            nextBlocks.map((b) => b.toLocaleString()).join(", ")
          }${colors.reset}`,
        );
      }
      console.log();
    }

    console.log(
      `${colors.gray}Last updated: ${
        new Date().toLocaleTimeString()
      } (updates every ${this.progressUpdateInterval / 1000}s)${colors.reset}`,
    );
    console.log(
      `${colors.gray}Press Ctrl+C to gracefully stop processing${colors.reset}`,
    );
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
            sortedExisting[sortedExisting.length - 1].toLocaleString()
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
    this.displayHeader("PROCESSING SUMMARY");

    console.log(
      `${colors.bright}${symbols.blocks} BLOCK ANALYSIS${colors.reset}`,
    );
    console.log(
      `   Total requested: ${colors.cyan}${totalRequested.toLocaleString()}${colors.reset} blocks`,
    );
    console.log(
      `   Already exist: ${colors.green}${alreadyExists.toLocaleString()}${colors.reset} blocks`,
    );
    console.log(
      `   Need processing: ${colors.yellow}${needsProcessing.toLocaleString()}${colors.reset} blocks`,
    );
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

    // Estimate processing time
    const avgTimePerBlock = this.estimateProcessingTime(startHeight, endHeight);
    if (avgTimePerBlock > 0) {
      const estimatedMs = needsProcessing * avgTimePerBlock;
      console.log(
        `${colors.bright}${symbols.time} TIME ESTIMATE${colors.reset}`,
      );
      console.log(
        `   Estimated duration: ${colors.cyan}${
          this.formatDuration(estimatedMs)
        }${colors.reset}`,
      );
      console.log(
        `   Est. completion: ${colors.cyan}${
          new Date(Date.now() + estimatedMs).toLocaleString()
        }${colors.reset}`,
      );
      console.log();
    }

    return true;
  }

  /**
   * Estimate processing time based on block height
   */
  estimateProcessingTime(startHeight, endHeight) {
    // Rough estimates based on typical block complexity
    const ranges = [
      { min: 0, max: 100000, msPerBlock: 50 },
      { min: 100001, max: 200000, msPerBlock: 200 },
      { min: 200001, max: 400000, msPerBlock: 2000 },
      { min: 400001, max: 600000, msPerBlock: 8000 },
      { min: 600001, max: 800000, msPerBlock: 12000 },
      { min: 800001, max: 1000000, msPerBlock: 15000 },
    ];

    let totalTime = 0;
    let totalBlocks = 0;

    for (let height = startHeight; height <= endHeight; height++) {
      if (!this.existingBlocks.has(height)) {
        const range = ranges.find((r) => height >= r.min && height <= r.max) ||
          ranges[ranges.length - 1];
        totalTime += range.msPerBlock;
        totalBlocks++;
      }
    }

    return totalBlocks > 0 ? totalTime / totalBlocks : 0;
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

    console.log();
    this.displayHeader("FINAL PROCESSING SUMMARY");

    console.log(
      `${colors.bright}${symbols.success} COMPLETION STATISTICS${colors.reset}`,
    );
    console.log(
      `   Total blocks requested: ${colors.cyan}${
        (this.totalBlocksToProcess + this.existingBlocks.size).toLocaleString()
      }${colors.reset}`,
    );
    console.log(
      `   Blocks already existed: ${colors.green}${this.existingBlocks.size.toLocaleString()}${colors.reset}`,
    );
    console.log(
      `   Blocks processed: ${colors.cyan}${processedBlocks.toLocaleString()}${colors.reset} in ${colors.cyan}${
        this.formatDuration(parseFloat(totalTime) * 1000)
      }${colors.reset}`,
    );
    console.log(
      `   Success: ${colors.green}${this.results.success.toLocaleString()}${colors.reset} blocks`,
    );
    console.log(
      `   Failed: ${colors.red}${this.results.failed.toLocaleString()}${colors.reset} blocks`,
    );
    console.log(
      `   Processing speed: ${colors.yellow}${blocksPerSecond} blocks/sec${colors.reset}`,
    );
    console.log();

    // Performance breakdown
    console.log(
      `${colors.bright}${symbols.processing} PERFORMANCE BREAKDOWN${colors.reset}`,
    );

    if (this.recentBlockTimes.length > 0) {
      const avgBlockTime = this.recentBlockTimes.reduce((sum, bt) =>
        sum + bt.duration, 0) /
        this.recentBlockTimes.length;
      console.log(
        `   Average block time: ${colors.cyan}${
          avgBlockTime.toFixed(0)
        }ms${colors.reset}`,
      );
    }

    // Worker performance summary
    console.log(`   Worker utilization:`);
    for (const [workerId, stats] of this.workerStats) {
      const avgTime = stats.totalTime > 0
        ? stats.totalTime / stats.blocksProcessed
        : 0;
      const successRate = stats.blocksProcessed > 0
        ? ((stats.blocksProcessed - stats.errors) / stats.blocksProcessed) *
          100
        : 0;
      console.log(
        `     Worker ${workerId}: ${colors.cyan}${stats.blocksProcessed}${colors.reset} blocks, ${colors.yellow}${
          avgTime.toFixed(0)
        }ms${colors.reset} avg, ${colors.green}${
          successRate.toFixed(1)
        }%${colors.reset} success`,
      );
    }
    console.log();

    const seconds = parseFloat(totalTime);
    if (seconds > 60) {
      const minutes = seconds / 60;
      if (minutes > 60) {
        const hours = minutes / 60;
        if (hours > 24) {
          const days = hours / 24;
          console.log(
            `${colors.bright}${symbols.time} TOTAL TIME${colors.reset}`,
          );
          console.log(
            `   ${colors.cyan}${days.toFixed(2)} days${colors.reset} (${
              hours.toFixed(2)
            } hours)`,
          );
        } else {
          console.log(
            `${colors.bright}${symbols.time} TOTAL TIME${colors.reset}`,
          );
          console.log(
            `   ${colors.cyan}${hours.toFixed(2)} hours${colors.reset} (${
              minutes.toFixed(2)
            } minutes)`,
          );
        }
      } else {
        console.log(
          `${colors.bright}${symbols.time} TOTAL TIME${colors.reset}`,
        );
        console.log(
          `   ${colors.cyan}${minutes.toFixed(2)} minutes${colors.reset} (${
            seconds.toFixed(2)
          } seconds)`,
        );
      }
      console.log();
    }

    if (this.results.errors.length > 0) {
      console.log(
        `${colors.bright}${colors.red}${symbols.warning} ERROR SUMMARY${colors.reset}`,
      );
      console.log(
        `   Total errors: ${colors.red}${this.results.errors.length}${colors.reset}`,
      );

      // Group similar errors
      const errorGroups = {};
      this.results.errors.forEach((error) => {
        const key = error.substring(0, 50); // Group by first 50 chars
        errorGroups[key] = (errorGroups[key] || 0) + 1;
      });

      console.log(`   Error types:`);
      Object.entries(errorGroups).forEach(([errorType, count]) => {
        console.log(
          `     ${colors.red}${count}x${colors.reset} ${errorType}${
            errorType.length >= 50 ? "..." : ""
          }`,
        );
      });
      console.log();
    }

    // Database statistics
    console.log(
      `${colors.bright}${symbols.info} DATABASE IMPACT${colors.reset}`,
    );
    console.log(`   Estimated rows inserted:`);
    console.log(
      `     Blocks: ${colors.cyan}${this.results.success.toLocaleString()}${colors.reset}`,
    );
    console.log(
      `     Transactions: ${colors.cyan}~${
        (this.results.success * 2000).toLocaleString()
      }${colors.reset} (estimated)`,
    );
    console.log(
      `     Outputs: ${colors.cyan}~${
        (this.results.success * 4000).toLocaleString()
      }${colors.reset} (estimated)`,
    );
    console.log(
      `     Inputs: ${colors.cyan}~${
        (this.results.success * 3500).toLocaleString()
      }${colors.reset} (estimated)`,
    );
    console.log();

    this.log("success", "ETL processing completed successfully!");

    if (this.results.failed > 0) {
      this.log(
        "warning",
        `Consider re-running failed blocks. Use: node src/index.js <start> <end> to retry specific ranges.`,
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
    this.displayHeader("BITCOIN ETL PROCESSOR");

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

// Handle process signals with enhanced messaging
process.on("SIGINT", () => {
  console.log(
    `\n${colors.yellow}${symbols.warning} Received SIGINT signal. Shutting down gracefully...${colors.reset}`,
  );
  console.log(
    `${colors.gray}Please wait for workers to finish current blocks...${colors.reset}`,
  );
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(
    `\n${colors.yellow}${symbols.warning} Received SIGTERM signal. Shutting down gracefully...${colors.reset}`,
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
    console.error(
      `${colors.red}${symbols.error} Please provide a valid start block height${colors.reset}`,
    );
    console.log(
      `${colors.cyan}Usage: node src/index.js <start_height> [end_height] [--verbose|-v] [--workers|-w <num_workers>] [--batch-size|-b <batch_size>]${colors.reset}`,
    );
    process.exit(1);
  }

  if (endHeight === undefined) {
    endHeight = startHeight;
  }

  if (endHeight < startHeight) {
    console.error(
      `${colors.red}${symbols.error} End height must be greater than or equal to start height${colors.reset}`,
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
    console.log(`${colors.bright}${symbols.info} CONFIGURATION${colors.reset}`);
    console.log(`   Workers: ${colors.cyan}${numWorkers}${colors.reset}`);
    console.log(`   Batch size: ${colors.cyan}${batchSize}${colors.reset}`);
    console.log(`   Verbose: ${colors.cyan}${verbose}${colors.reset}`);
    console.log(
      `   Block range: ${colors.cyan}${startHeight.toLocaleString()} to ${endHeight.toLocaleString()}${colors.reset}`,
    );
    console.log();

    const isValid = await etl.validateBlockRange(startHeight, endHeight);
    if (!isValid) {
      console.error(
        `${colors.red}${symbols.error} Invalid block range. Please check the block heights.${colors.reset}`,
      );
      process.exit(1);
    }

    await etl.processBlockRange(startHeight, endHeight);
  } catch (error) {
    console.error(
      `${colors.red}${symbols.error} Fatal error: ${error.message}${colors.reset}`,
    );
    if (verbose) {
      console.error(`${colors.gray}${error.stack}${colors.reset}`);
    }
    process.exit(1);
  }
}

main();
