// src/worker.js - Enhanced with batch size limits to avoid PostgreSQL parameter limit
import path from "path";
import { fileURLToPath } from "url";
import { RPC } from "./rpc.js";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";

// Get worker ID from environment
const workerId = process.env.WORKER_ID || "unknown";

// PostgreSQL parameter limit constants
const POSTGRES_MAX_PARAMS = 65534; // PostgreSQL protocol limit
const SAFETY_MARGIN = 1000; // Leave some margin for safety
const EFFECTIVE_MAX_PARAMS = POSTGRES_MAX_PARAMS - SAFETY_MARGIN;

// Calculate safe batch sizes for each table based on column count
const BATCH_LIMITS = {
  // block table has ~11 columns, so max batch = 64534 / 11 ≈ 5866
  blocks: Math.floor(EFFECTIVE_MAX_PARAMS / 11),
  // transaction table has ~8 columns, so max batch = 64534 / 8 ≈ 8066
  transactions: Math.floor(EFFECTIVE_MAX_PARAMS / 8),
  // output table has ~7 columns, so max batch = 64534 / 7 ≈ 9219
  outputs: Math.floor(EFFECTIVE_MAX_PARAMS / 7),
  // input table has ~8 columns, so max batch = 64534 / 8 ≈ 8066
  inputs: Math.floor(EFFECTIVE_MAX_PARAMS / 8),
};

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
};

const symbols = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  processing: "⚡",
  time: "⏱",
  worker: "👷",
};

// Flag to track if we're shutting down
let isShuttingDown = false;

// Enhanced logging utility for workers
function workerLog(level, message, data = null) {
  if (isShuttingDown) return;

  const timestamp = new Date().toLocaleTimeString();
  const workerPrefix =
    `${colors.gray}[W${workerId}:${timestamp}]${colors.reset}`;

  switch (level) {
    case "info":
      console.log(
        `${workerPrefix} ${colors.blue}${symbols.info}${colors.reset} ${message}`,
      );
      break;
    case "success":
      console.log(
        `${workerPrefix} ${colors.green}${symbols.success}${colors.reset} ${message}`,
      );
      break;
    case "warning":
      console.log(
        `${workerPrefix} ${colors.yellow}${symbols.warning}${colors.reset} ${message}`,
      );
      break;
    case "error":
      console.log(
        `${workerPrefix} ${colors.red}${symbols.error}${colors.reset} ${message}`,
      );
      break;
    case "processing":
      console.log(
        `${workerPrefix} ${colors.cyan}${symbols.processing}${colors.reset} ${message}`,
      );
      break;
    default:
      console.log(`${workerPrefix} ${message}`);
  }

  if (data) {
    console.log(
      `${colors.gray}${JSON.stringify(data, null, 2)}${colors.reset}`,
    );
  }
}

// Log worker initialization with enhanced output
workerLog(
  "info",
  `Worker ${workerId} ready with batch limits: blocks=${BATCH_LIMITS.blocks}, txs=${BATCH_LIMITS.transactions}, outputs=${BATCH_LIMITS.outputs}, inputs=${BATCH_LIMITS.inputs}`,
);

function safeToBigInt(value) {
  if (value === null || value === undefined) {
    return BigInt(0);
  }

  if (typeof value === "string") {
    const numericValue = parseFloat(value);
    return BigInt(Math.floor(numericValue));
  }

  if (typeof value === "number") {
    return BigInt(Math.floor(value));
  }

  if (typeof value === "bigint") {
    return value;
  }

  return BigInt(0);
}

function btcToSatoshis(btcValue) {
  if (!btcValue || isNaN(btcValue)) {
    return BigInt(0);
  }

  const satoshis = Math.round(btcValue * 100000000);
  return BigInt(satoshis);
}

/**
 * Helper function to split an array into chunks of specified size
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Safe batch insert that respects PostgreSQL parameter limits
 */
async function safeBatchInsert(
  table,
  data,
  tableName,
  batchLimit,
  verbose = false,
) {
  if (!data || data.length === 0) {
    return;
  }

  // If data fits within limit, insert normally
  if (data.length <= batchLimit) {
    if (verbose) {
      workerLog(
        "info",
        `Inserting ${data.length} ${tableName} records in single batch`,
      );
    }
    await db.insert(table).values(data).onConflictDoNothing();
    return;
  }

  // Split into chunks
  const chunks = chunkArray(data, batchLimit);
  if (verbose) {
    workerLog(
      "info",
      `Splitting ${data.length} ${tableName} records into ${chunks.length} batches (max ${batchLimit} per batch)`,
    );
  }

  // Insert each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (verbose && chunks.length > 1) {
      workerLog(
        "info",
        `Inserting ${tableName} batch ${
          i + 1
        }/${chunks.length} (${chunk.length} records)`,
      );
    }

    try {
      await db.insert(table).values(chunk).onConflictDoNothing();
    } catch (error) {
      workerLog(
        "error",
        `Error inserting ${tableName} batch ${
          i + 1
        }/${chunks.length}: ${error.message}`,
      );
      // Calculate parameters for debugging
      const estimatedParams = chunk.length * Object.keys(chunk[0] || {}).length;
      workerLog(
        "error",
        `Batch had ${chunk.length} records with ~${estimatedParams} parameters`,
      );
      throw error;
    }
  }

  if (verbose && chunks.length > 1) {
    workerLog(
      "success",
      `Completed ${tableName} batch inserts: ${chunks.length} batches, ${data.length} total records`,
    );
  }
}

class BlockProcessor {
  constructor(verbose = false) {
    this.rpc = new RPC();
    this.processedTxs = new Set();
    this.verbose = verbose;
    this.stats = {
      blocksProcessed: 0,
      transactionsProcessed: 0,
      outputsProcessed: 0,
      inputsProcessed: 0,
      totalProcessingTime: 0,
      avgBlockTime: 0,
      batchesExecuted: 0,
    };
  }

  /**
   * Format processing time in a readable way
   */
  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  /**
   * Format numbers with commas
   */
  formatNumber(num) {
    return num.toLocaleString();
  }

  /**
   * Process a block at the given height and store it in the database
   */
  async processBlock(blockHeight) {
    const startTime = Date.now();

    if (this.verbose) {
      workerLog(
        "processing",
        `Starting block ${this.formatNumber(blockHeight)}...`,
      );
    }

    try {
      // Get the block hash
      const blockHash = await this.rpc.getBlockHash(blockHeight);

      if (this.verbose) {
        workerLog(
          "info",
          `Retrieved hash for block ${this.formatNumber(blockHeight)}: ${
            blockHash.substring(0, 16)
          }...`,
        );
      }

      // Get the block data with transactions
      const blockData = await this.rpc.getBlock(blockHash, 2);

      // Insert the block into the database
      await this.insertBlock(blockData);

      // Process all transactions in the block
      const txResult = await this.processTransactions(blockData);

      const processingTime = Date.now() - startTime;
      this.updateStats(blockData, processingTime);

      if (this.verbose) {
        workerLog(
          "success",
          `Block ${this.formatNumber(blockHeight)} completed in ${
            this.formatTime(processingTime)
          } ` +
            `(${this.formatNumber(blockData.tx.length)} txs, ${
              this.formatNumber(txResult.outputs)
            } outputs, ${this.formatNumber(txResult.inputs)} inputs)`,
        );
      }

      return {
        success: true,
        blockHeight,
        txCount: blockData.tx.length,
        blockHash,
        processingTime,
        outputs: txResult.outputs,
        inputs: txResult.inputs,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      workerLog(
        "error",
        `Block ${this.formatNumber(blockHeight)} failed after ${
          this.formatTime(processingTime)
        }: ${error.message}`,
      );
      return {
        success: false,
        blockHeight,
        error: error.message,
        processingTime,
      };
    }
  }

  /**
   * Process a block using pre-fetched block data
   */
  async processBlockData(blockHeight, blockData) {
    const startTime = Date.now();

    if (this.verbose) {
      workerLog(
        "processing",
        `Processing prefetched block ${this.formatNumber(blockHeight)} (${
          this.formatNumber(blockData.tx.length)
        } transactions)...`,
      );
    }

    try {
      // Validate the block data
      if (!blockData || !blockData.hash || !blockData.tx) {
        throw new Error(`Invalid block data for height ${blockHeight}`);
      }

      // Verify the block height matches
      if (blockData.height !== blockHeight) {
        throw new Error(
          `Block height mismatch: expected ${blockHeight}, got ${blockData.height}`,
        );
      }

      // Insert the block into the database
      await this.insertBlock(blockData);

      // Process all transactions in the block
      const txResult = await this.processTransactions(blockData);

      const processingTime = Date.now() - startTime;
      this.updateStats(blockData, processingTime);

      workerLog(
        "success",
        `Block ${this.formatNumber(blockHeight)} processed in ${
          this.formatTime(processingTime)
        } ` +
          `${colors.gray}(${this.formatNumber(blockData.tx.length)} txs, ${
            this.formatNumber(txResult.outputs)
          } outputs, ${
            this.formatNumber(txResult.inputs)
          } inputs, ${this.stats.batchesExecuted} batches)${colors.reset}`,
      );

      return {
        success: true,
        blockHeight,
        txCount: blockData.tx.length,
        blockHash: blockData.hash,
        processingTime,
        outputs: txResult.outputs,
        inputs: txResult.inputs,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      workerLog(
        "error",
        `Block ${this.formatNumber(blockHeight)} failed after ${
          this.formatTime(processingTime)
        }: ${error.message}`,
      );
      return {
        success: false,
        blockHeight,
        error: error.message,
        processingTime,
      };
    }
  }

  /**
   * Update internal statistics
   */
  updateStats(blockData, processingTime) {
    this.stats.blocksProcessed++;
    this.stats.transactionsProcessed += blockData.tx.length;
    this.stats.totalProcessingTime += processingTime;
    this.stats.avgBlockTime = this.stats.totalProcessingTime /
      this.stats.blocksProcessed;
  }

  /**
   * Insert a block into the database
   */
  async insertBlock(blockData) {
    if (this.verbose) {
      workerLog(
        "info",
        `Inserting block ${
          this.formatNumber(blockData.height)
        } into database...`,
      );
    }

    try {
      // Calculate the total fees and reward
      let totalFees = BigInt(0);

      // Calculate coinbase value in satoshis
      const coinbaseValue = blockData.tx[0].vout.reduce((sum, vout) => {
        return sum + btcToSatoshis(vout.value);
      }, BigInt(0));

      const blockReward = this.calculateBlockReward(blockData.height);

      // Calculate fees (coinbase value - block reward)
      totalFees = coinbaseValue - blockReward;

      // Ensure fees are not negative
      if (totalFees < 0) {
        totalFees = BigInt(0);
      }

      // Convert bits from hex string to BigInt
      let bitsValue = BigInt(0);
      if (blockData.bits) {
        try {
          bitsValue = BigInt(parseInt(blockData.bits, 16));
        } catch (e) {
          if (this.verbose) {
            workerLog(
              "warning",
              `Invalid bits value for block ${blockData.height}: ${blockData.bits}`,
            );
          }
        }
      }

      // Insert the block (single record, no batching needed)
      await db
        .insert(schema.block)
        .values({
          blockHeight: blockData.height,
          hash: blockData.hash,
          version: blockData.version,
          merkleRoot: blockData.merkleroot,
          timestamp: new Date(blockData.time * 1000),
          bits: bitsValue,
          nonce: safeToBigInt(blockData.nonce),
          size: safeToBigInt(blockData.size),
          weight: safeToBigInt(blockData.weight || blockData.size * 4),
          reward: blockReward,
          fees: totalFees,
        })
        .onConflictDoNothing();

      if (this.verbose) {
        workerLog(
          "success",
          `Block ${this.formatNumber(blockData.height)} metadata inserted`,
        );
      }
    } catch (error) {
      workerLog(
        "error",
        `Error inserting block ${blockData.height}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Calculate the block reward based on the block height
   */
  calculateBlockReward(height) {
    const halvings = Math.floor(height / 210000);
    if (halvings >= 64) return BigInt(0);

    const initialReward = BigInt(5000000000);
    return initialReward >> BigInt(halvings);
  }

  /**
   * Process all transactions in a block using safe batch database operations
   */
  async processTransactions(blockData) {
    if (this.verbose) {
      workerLog(
        "processing",
        `Processing ${
          this.formatNumber(blockData.tx.length)
        } transactions for block ${this.formatNumber(blockData.height)}...`,
      );
    }

    // Reset processed transactions set for this block
    this.processedTxs.clear();

    // Prepare arrays for batch inserts
    const transactionBatch = [];
    const outputBatch = [];
    const inputBatch = [];

    // Process each transaction in order
    for (let i = 0; i < blockData.tx.length; i++) {
      try {
        const tx = blockData.tx[i];

        // Skip if we've already processed this transaction
        if (this.processedTxs.has(tx.txid)) {
          if (this.verbose) {
            workerLog("warning", `Skipping duplicate transaction ${tx.txid}`);
          }
          continue;
        }

        if (this.verbose && i > 0 && i % 500 === 0) {
          workerLog(
            "info",
            `Processing transaction ${this.formatNumber(i + 1)}/${
              this.formatNumber(blockData.tx.length)
            }: ${tx.txid.substring(0, 16)}...`,
          );
        }

        // Prepare transaction data
        const txData = this.prepareTransactionData(tx, blockData.height, i);
        transactionBatch.push(txData.transaction);
        outputBatch.push(...txData.outputs);
        inputBatch.push(...txData.inputs);

        this.processedTxs.add(tx.txid);
      } catch (error) {
        workerLog(
          "error",
          `Error preparing transaction at position ${i}: ${error.message}`,
        );
        // Continue with next transaction instead of failing the entire batch
      }
    }

    // Execute safe batch inserts with parameter limit protection
    try {
      let totalBatches = 0;

      if (transactionBatch.length > 0) {
        if (this.verbose) {
          workerLog(
            "info",
            `Safe batch inserting ${
              this.formatNumber(transactionBatch.length)
            } transactions...`,
          );
        }
        await safeBatchInsert(
          schema.transaction,
          transactionBatch,
          "transactions",
          BATCH_LIMITS.transactions,
          this.verbose,
        );
        const batchCount = Math.ceil(
          transactionBatch.length / BATCH_LIMITS.transactions,
        );
        totalBatches += batchCount;
      }

      if (outputBatch.length > 0) {
        if (this.verbose) {
          workerLog(
            "info",
            `Safe batch inserting ${
              this.formatNumber(outputBatch.length)
            } outputs...`,
          );
        }
        await safeBatchInsert(
          schema.output,
          outputBatch,
          "outputs",
          BATCH_LIMITS.outputs,
          this.verbose,
        );
        const batchCount = Math.ceil(outputBatch.length / BATCH_LIMITS.outputs);
        totalBatches += batchCount;
      }

      if (inputBatch.length > 0) {
        if (this.verbose) {
          workerLog(
            "info",
            `Safe batch inserting ${
              this.formatNumber(inputBatch.length)
            } inputs...`,
          );
        }
        await safeBatchInsert(
          schema.input,
          inputBatch,
          "inputs",
          BATCH_LIMITS.inputs,
          this.verbose,
        );
        const batchCount = Math.ceil(inputBatch.length / BATCH_LIMITS.inputs);
        totalBatches += batchCount;
      }

      this.stats.batchesExecuted += totalBatches;

      if (this.verbose) {
        workerLog(
          "success",
          `Safe batch insert completed for block ${
            this.formatNumber(blockData.height)
          } (${totalBatches} total batches)`,
        );
      }

      return {
        transactions: transactionBatch.length,
        outputs: outputBatch.length,
        inputs: inputBatch.length,
      };
    } catch (error) {
      workerLog(
        "error",
        `Error executing safe batch inserts for block ${blockData.height}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Prepare transaction data for batch insert
   */
  prepareTransactionData(tx, blockHeight, position) {
    // Determine if this is a coinbase transaction
    const isCoinbase = position === 0;

    // Calculate the transaction fee
    let fee = BigInt(0);
    if (!isCoinbase) {
      // Sum of inputs - sum of outputs
      const inputValue = tx.vin.reduce((sum, vin) => {
        // Skip coinbase inputs
        if (vin.coinbase) return sum;

        // Find the referenced output if it has prevout
        if (vin.prevout && vin.prevout.value !== undefined) {
          return sum + btcToSatoshis(vin.prevout.value);
        }

        return sum;
      }, BigInt(0));

      const outputValue = tx.vout.reduce((sum, vout) => {
        return sum + btcToSatoshis(vout.value);
      }, BigInt(0));

      fee = inputValue - outputValue;
      // If fee calculation is negative, set to 0 (data might be incomplete)
      if (fee < 0) fee = BigInt(0);
    }

    // Determine transaction type based on features
    let txType = "UNKNOWN";
    if (isCoinbase) {
      txType = "COINBASE";
    } else if (tx.vin.some((vin) => vin.txinwitness) || tx.version >= 2) {
      txType = "SEGWIT";
    } else {
      txType = "LEGACY";
    }

    // Prepare transaction record
    const transaction = {
      txHash: tx.txid,
      blockHeight: blockHeight,
      version: tx.version,
      size: safeToBigInt(tx.size),
      weight: safeToBigInt(tx.weight || tx.size * 4),
      locktime: safeToBigInt(tx.locktime),
      isCoinbase: isCoinbase,
      position: position,
      fee: fee,
      type: txType,
    };

    // Prepare outputs
    const outputs = tx.vout.map((vout, i) => {
      // Extract address and type
      let address = null;
      let addressType = null;
      let scriptType = "UNKNOWN";

      if (vout.scriptPubKey) {
        // Get script type
        scriptType = vout.scriptPubKey.type || "UNKNOWN";

        // Handle different output types
        if (
          vout.scriptPubKey.addresses &&
          vout.scriptPubKey.addresses.length > 0
        ) {
          address = vout.scriptPubKey.addresses[0];
        } else if (vout.scriptPubKey.address) {
          address = vout.scriptPubKey.address;
        }

        // Determine address type from script or address prefix
        if (scriptType === "pubkeyhash") addressType = "P2PKH";
        else if (scriptType === "scripthash") addressType = "P2SH";
        else if (scriptType === "witness_v0_keyhash") addressType = "P2WPKH";
        else if (scriptType === "witness_v0_scripthash") addressType = "P2WSH";
        else if (scriptType === "pubkey") addressType = "P2PK";
        else addressType = "UNKNOWN";
      }

      return {
        txHash: tx.txid,
        position: i,
        value: btcToSatoshis(vout.value),
        scriptPubkey: vout.scriptPubKey ? vout.scriptPubKey.hex || "" : "",
        address: address,
        addressType: addressType,
        scriptType: scriptType,
      };
    });

    // Prepare inputs
    const inputs = tx.vin.map((vin, i) => {
      // Skip coinbase inputs as they don't have prevout
      if (vin.coinbase) {
        return {
          txHash: tx.txid,
          position: i,
          prevTxHash: null,
          prevPosition: null,
          scriptSig: vin.coinbase,
          sequence: safeToBigInt(vin.sequence),
          witness: null,
          scriptType: "COINBASE",
        };
      }

      // Determine script type
      let scriptType = "UNKNOWN";
      if (vin.witness && vin.witness.length > 0) {
        scriptType = "WITNESS";
      } else if (vin.scriptSig && vin.scriptSig.hex) {
        scriptType = "SCRIPT_SIG";
      }

      // Format witness data as JSON string if it exists
      const witnessData = vin.witness ? JSON.stringify(vin.witness) : null;

      return {
        txHash: tx.txid,
        position: i,
        prevTxHash: vin.txid || null,
        prevPosition: vin.vout !== undefined ? vin.vout : null,
        scriptSig: vin.scriptSig ? vin.scriptSig.hex || null : null,
        sequence: safeToBigInt(vin.sequence),
        witness: witnessData,
        scriptType: scriptType,
      };
    });

    return {
      transaction,
      outputs,
      inputs,
    };
  }

  /**
   * Get worker performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgBlockTime: this.stats.avgBlockTime.toFixed(2),
      totalProcessingTime: this.formatTime(this.stats.totalProcessingTime),
    };
  }
}

// Worker message handler function
async function handleMessage(message) {
  if (isShuttingDown) {
    return { success: false, error: "Worker is shutting down" };
  }

  if (message.cmd === "process_block") {
    const { blockHeight, verbose } = message.data;
    const processor = new BlockProcessor(verbose);

    try {
      const result = await processor.processBlock(blockHeight);

      if (verbose && result.success) {
        workerLog(
          "info",
          `Worker stats: ${JSON.stringify(processor.getStats())}`,
        );
      }

      return { success: true, result };
    } catch (error) {
      workerLog(
        "error",
        `Failed to process block ${blockHeight}: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
        blockHeight,
      };
    }
  } else if (message.cmd === "process_block_data") {
    const { blockHeight, blockData, verbose } = message.data;
    const processor = new BlockProcessor(verbose);

    try {
      const result = await processor.processBlockData(blockHeight, blockData);

      if (verbose && result.success) {
        workerLog(
          "info",
          `Worker stats: ${JSON.stringify(processor.getStats())}`,
        );
      }

      return { success: true, result };
    } catch (error) {
      workerLog(
        "error",
        `Failed to process block data ${blockHeight}: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
        blockHeight,
      };
    }
  }

  workerLog("error", `Unknown command: ${message.cmd}`);
  return { success: false, error: "Unknown command" };
}

// Flag to track if we've already notified the parent process about an error
let errorNotified = false;

// Handle messages when imported as a worker through child_process
if (process.send) {
  process.on("message", async (message) => {
    if (isShuttingDown) return;

    try {
      const result = await handleMessage(message);
      if (!isShuttingDown) {
        process.send({ type: "result", data: result });
      }
    } catch (error) {
      if (!errorNotified && !isShuttingDown) {
        errorNotified = true;
        workerLog("error", `Unhandled error: ${error.message}`);
        process.send({
          type: "error",
          data: {
            message: error.message,
            stack: error.stack,
          },
        });
      }
    }
  });

  // Handle process termination gracefully
  process.on("SIGINT", () => {
    workerLog("warning", "Received SIGINT, shutting down gracefully...");
    isShuttingDown = true;
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    workerLog("warning", "Received SIGTERM, shutting down gracefully...");
    isShuttingDown = true;
    process.exit(0);
  });

  // Handle database connection errors
  process.on("unhandledRejection", (reason, promise) => {
    if (!errorNotified && !isShuttingDown) {
      errorNotified = true;
      workerLog(
        "error",
        `Unhandled promise rejection: ${reason?.message || reason}`,
      );
      process.send({
        type: "error",
        data: {
          message: reason?.message || "Unhandled Promise Rejection",
          stack: reason?.stack,
        },
      });
    }
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    if (!errorNotified && !isShuttingDown) {
      isShuttingDown = true;
      errorNotified = true;
      workerLog("error", `Uncaught exception: ${error.message}`);

      try {
        process.send({
          type: "error",
          data: {
            message: error.message,
            stack: error.stack,
          },
        });
      } catch (e) {
        // Ignore send errors during shutdown
      }

      // Give the process a moment to send the error message before exiting
      setTimeout(() => {
        process.exit(1);
      }, 100);
    }
  });

  // Handle disconnect from parent
  process.on("disconnect", () => {
    workerLog("warning", "Disconnected from parent process, shutting down...");
    isShuttingDown = true;
    process.exit(0);
  });

  // Show ready message
  workerLog(
    "success",
    `Worker ${workerId} initialized and ready for processing with PostgreSQL parameter limits enforced`,
  );
}

// Export for direct usage
export { BlockProcessor, handleMessage };
