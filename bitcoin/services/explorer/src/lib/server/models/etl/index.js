// lib/server/models/etl/index.js
import BlockETL from "./block.js";
import TransactionETL from "./transaction.js";
import pkg from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import RPC from "../../models/rpc.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

const { config } = pkg;

// Configuration for the ETL process
const START_BLOCK = 800013; // First block to process
const END_BLOCK = 800014; // Last block to process
const BATCH_SIZE = 1; // Number of blocks to process in parallel (reduce for stability)
const ERROR_RETRY = 3; // Number of times to retry on error
const PROGRESS_FILE = "etl_progress.json"; // File to track progress for resumability

// Initialize environment variables
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const rootDir = join(__dirname, "../../../../..");

  if (fs.existsSync(join(rootDir, ".env"))) {
    config({ path: join(rootDir, ".env") });
  }
} catch (error) {
  console.error("Error loading environment variables:", error.message);
  process.exit(1);
}

// For database operations
let db;

// Function to initialize DB connection
async function initDB() {
  if (!db) {
    try {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          "DATABASE_URL is not set. Please set it in your .env file or environment",
        );
      }

      const client = postgres(process.env.DATABASE_URL);
      db = drizzle(client, { schema });
      console.log("Database connection initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database connection:", error);
      throw error;
    }
  }
  return db;
}

// Create instances of the ETL classes
const blockETL = new BlockETL();
const transactionETL = new TransactionETL();
const rpc = new RPC();

/**
 * Save current progress to allow resuming
 * @param {number} lastCompleted - Last successfully completed block
 */
function saveProgress(lastCompleted) {
  const data = {
    lastCompletedBlock: lastCompleted,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  console.log(`Progress saved: Block ${lastCompleted}`);
}

/**
 * Load previous progress if available
 * @returns {number} - Last successfully completed block or START_BLOCK if no progress file
 */
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      console.log(`Found previous progress: Block ${data.lastCompletedBlock}`);
      return data.lastCompletedBlock;
    }
  } catch (error) {
    console.error("Error loading progress file:", error.message);
  }
  return START_BLOCK - 1; // Start from the beginning
}

/**
 * Check if a block already exists in the database
 * @param {number} height - Block height to check
 * @returns {Promise<boolean>} - True if block exists, false otherwise
 */
async function blockExists(height) {
  try {
    const database = await initDB();
    const result = await database.select()
      .from(schema.blocks)
      .where(eq(schema.blocks.height, height))
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error(`Error checking if block ${height} exists:`, error.message);
    return false;
  }
}

/**
 * Process a single block and its transactions
 * @param {number} height - Block height to process
 * @returns {Promise<object>} - Processing result
 */
async function processBlock(height) {
  try {
    console.log(`Processing block ${height}...`);

    // Check if block already exists to avoid duplicate key errors
    const exists = await blockExists(height);
    if (exists) {
      console.log(
        `Block ${height} already exists in database, skipping block insert`,
      );

      // Get the block hash for transaction processing
      const blockHash = await rpc.getBlockHash(height);

      // Process transactions even if block exists
      console.log(`Processing transactions for block ${height}...`);
      const txResults = await transactionETL.processBlockTransactions(height);

      return {
        height,
        success: true,
        blockHash,
        transactionsProcessed: txResults.succeeded,
        transactionsFailed: txResults.failed,
      };
    }

    // If block doesn't exist, process it normally
    // First process the block
    const blockResult = await blockETL.processBlock(height);

    // Then process all transactions in the block
    const txResults = await transactionETL.processBlockTransactions(height);

    return {
      height,
      success: true,
      blockHash: blockResult.hash,
      transactionsProcessed: txResults.succeeded,
      transactionsFailed: txResults.failed,
    };
  } catch (error) {
    console.error(`Error processing block ${height}:`, error.message);
    return {
      height,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process a batch of blocks in sequence
 * @param {number[]} blockHeights - Array of block heights to process
 * @returns {Promise<object[]>} - Array of processing results
 */
async function processBatch(blockHeights) {
  const results = [];

  // Process blocks sequentially for stability
  for (const height of blockHeights) {
    try {
      const result = await processBlock(height);
      results.push(result);
    } catch (error) {
      console.error(
        `Error in batch processing for block ${height}:`,
        error.message,
      );
      results.push({
        height,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Main ETL function to process blocks from START_BLOCK to END_BLOCK
 */
async function runETL() {
  console.log(`Starting Bitcoin blockchain ETL process`);
  console.log(`Processing blocks from ${START_BLOCK} to ${END_BLOCK}`);

  // Load previous progress to allow resuming
  const lastCompleted = loadProgress();
  let currentBlock = lastCompleted + 1;

  const startTime = new Date();
  let totalSuccess = 0;
  let totalFailed = 0;

  // Process blocks in batches until we reach the end block
  while (currentBlock <= END_BLOCK) {
    const batchEnd = Math.min(currentBlock + BATCH_SIZE - 1, END_BLOCK);
    console.log(`\nProcessing batch: Blocks ${currentBlock} to ${batchEnd}`);

    // Create array of block heights for this batch
    const blockHeights = [];
    for (let i = currentBlock; i <= batchEnd; i++) {
      blockHeights.push(i);
    }

    // Process this batch
    const batchStartTime = new Date();
    const results = await processBatch(blockHeights);
    const batchEndTime = new Date();
    const batchDuration = (batchEndTime - batchStartTime) / 1000; // in seconds

    // Count successes and failures
    const batchSuccess = results.filter((r) => r.success).length;
    const batchFailed = results.filter((r) => !r.success).length;

    totalSuccess += batchSuccess;
    totalFailed += batchFailed;

    // Display batch summary
    console.log(`\nBatch completed in ${batchDuration.toFixed(2)} seconds`);
    console.log(`Success: ${batchSuccess}, Failed: ${batchFailed}`);

    // Save progress after each batch
    saveProgress(batchEnd);

    // Move to next batch
    currentBlock = batchEnd + 1;

    // Calculate and display progress
    const progress =
      ((currentBlock - START_BLOCK) / (END_BLOCK - START_BLOCK + 1) * 100)
        .toFixed(2);
    const elapsedTime = (new Date() - startTime) / 1000 / 60; // in minutes
    const estimatedTotal = elapsedTime / (progress / 100);
    const remainingTime = estimatedTotal - elapsedTime;

    console.log(`\nProgress: ${progress}% complete`);
    console.log(`Elapsed time: ${elapsedTime.toFixed(2)} minutes`);
    console.log(
      `Estimated time remaining: ${remainingTime.toFixed(2)} minutes`,
    );
  }

  // Display final summary
  const endTime = new Date();
  const totalDuration = (endTime - startTime) / 1000 / 60; // in minutes

  console.log(`\n=== ETL Process Complete ===`);
  console.log(`Processed blocks ${START_BLOCK} to ${END_BLOCK}`);
  console.log(`Total successful: ${totalSuccess}`);
  console.log(`Total failed: ${totalFailed}`);
  console.log(`Total time: ${totalDuration.toFixed(2)} minutes`);
  console.log(
    `Average time per block: ${
      (totalDuration * 60 / (END_BLOCK - START_BLOCK + 1)).toFixed(2)
    } seconds`,
  );

  // Explicitly exit when done to prevent hanging
  process.exit(0);
}

// Execute the ETL process if this file is run directly
if (import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ""))) {
  runETL().catch((error) => {
    console.error("Fatal ETL error:", error);
    process.exit(1);
  });
}

export { processBlock, runETL };
