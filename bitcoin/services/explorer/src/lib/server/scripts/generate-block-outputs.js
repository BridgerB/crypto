// src/lib/server/scripts/generate-block-outputs.js
/**
 * Script to generate block outputs and save them to JSON files for a range of blocks
 *
 * Usage: node src/lib/server/scripts/generate-block-outputs.js [startHeight] [endHeight]
 *
 * If no arguments are provided, defaults to blocks 0 through 100000
 * This script will use the optimized Block class to fetch output addresses and amounts
 * for the given block range and save them to JSON files at data/address/<blockHeight>.json
 * If a file already exists for a block, that block will be skipped
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Block from "../models/block.js";
import RPC from "../models/rpc.js";
import { performance } from "perf_hooks";

// Get the directory name using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get block range from command-line arguments or use defaults
const startHeight = parseInt(process.argv[2]) || 0;
const endHeight = parseInt(process.argv[3]) || 100000;

// Initialize RPC class for Bitcoin RPC commands
const rpc = new RPC();

// Validate inputs
if (isNaN(startHeight) || startHeight < 0) {
  console.error(
    "Please provide a valid starting block height (non-negative integer)",
  );
  process.exit(1);
}

if (isNaN(endHeight) || endHeight < startHeight) {
  console.error(
    "Please provide a valid ending block height (must be >= starting height)",
  );
  process.exit(1);
}

/**
 * Creates the output directory if it doesn't exist
 * @returns {string} The path to the output directory
 */
function ensureOutputDirectory() {
  const dirPath = path.resolve(__dirname, "../../../../data/address");

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

/**
 * Checks if the output file for a block already exists
 * @param {string} dirPath - The output directory path
 * @param {number} height - The block height
 * @returns {boolean} - True if the file exists, false otherwise
 */
function outputFileExists(dirPath, height) {
  const filePath = path.join(dirPath, `${height}.json`);
  return fs.existsSync(filePath);
}

/**
 * Get the block time (timestamp) from bitcoin-cli
 * @param {number} height - The block height
 * @returns {Promise<string>} - The formatted block time
 */
async function getBlockTime(height) {
  try {
    // First get block hash
    const blockHash = await rpc.getBlockHash(height);

    // Then get block info
    const blockData = await rpc.getBlock(blockHash);

    // Format the timestamp from Unix time to UTC
    const blockTime = new Date(blockData.time * 1000).toISOString();
    return blockTime;
  } catch (error) {
    console.error(
      `Error getting block time for height ${height}:`,
      error.message,
    );
    return "Unknown time";
  }
}

/**
 * Process a single block and save its outputs to a JSON file
 * @param {Block} blockInstance - The Block class instance
 * @param {string} dirPath - The output directory path
 * @param {number} height - The block height to process
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
async function processBlock(blockInstance, dirPath, height) {
  const blockStartTime = performance.now();

  try {
    console.log(`Processing block ${height}...`);

    // Get block timestamp and outputs concurrently
    const [blockTime, outputs] = await Promise.all([
      getBlockTime(height),
      blockInstance.getOutputs(height, false),
    ]);

    // Create the file path
    const filePath = path.join(dirPath, `${height}.json`);

    // Write the outputs to the file
    fs.writeFileSync(filePath, JSON.stringify(outputs, null, 2));

    const blockEndTime = performance.now();
    const blockDuration = ((blockEndTime - blockStartTime) / 1000).toFixed(2);

    // Format timestamp for display
    const formattedTime = blockTime.replace("T", " ").replace(".000Z", " UTC");

    // Display summary with block time
    console.log(
      `✓ Block ${height}: Found ${
        Object.keys(outputs).length
      } outputs, mined on ${formattedTime} (${blockDuration}s)`,
    );

    return true;
  } catch (error) {
    console.error(`✗ Error processing block ${height}: ${error.message}`);
    return false;
  }
}

/**
 * Process a range of blocks
 * @param {number} start - The starting block height
 * @param {number} end - The ending block height
 */
async function processBlockRange(start, end) {
  const totalStartTime = performance.now();
  const blockInstance = new Block();
  const dirPath = ensureOutputDirectory();

  console.log(`Starting processing of blocks ${start} through ${end}`);
  console.log("Skipping blocks that already have output files");

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let height = start; height <= end; height++) {
    if (outputFileExists(dirPath, height)) {
      // For skipped blocks, just show a simpler message without timestamp
      console.log(`- Block ${height}: Skipped (file already exists)`);
      skipped++;
      continue;
    }

    const success = await processBlock(blockInstance, dirPath, height);
    if (success) {
      processed++;
    } else {
      failed++;
    }
  }

  const totalEndTime = performance.now();
  const totalDuration = ((totalEndTime - totalStartTime) / 1000 / 60).toFixed(
    2,
  );

  console.log("\n========== PROCESSING COMPLETE ==========");
  console.log(`Processed ${processed} blocks`);
  console.log(`Skipped ${skipped} existing blocks`);
  console.log(`Failed ${failed} blocks`);
  console.log(`Total time: ${totalDuration} minutes`);
  console.log("=========================================");
}

// Execute the block range processing
console.log(`Processing blocks from ${startHeight} to ${endHeight}...`);
processBlockRange(startHeight, endHeight).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
