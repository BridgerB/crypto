// src/lib/server/models/etl/block.js
import RPC from "../../models/rpc.js";
import pkg from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const { config } = pkg;

// Determine if running in SvelteKit context or standalone
let db;

// Function to initialize DB connection
async function initDB() {
  if (!db) {
    // Try to load environment variables from .env file if running as standalone script
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      // Look for .env file in the project root (assuming standard structure)
      const rootDir = join(__dirname, "../../../../..");

      // First try to load from root .env
      if (fs.existsSync(join(rootDir, ".env"))) {
        config({ path: join(rootDir, ".env") });
      }

      // Check if DATABASE_URL is set either from .env or directly in environment
      if (!process.env.DATABASE_URL) {
        throw new Error(
          "DATABASE_URL is not set. Please set it in your .env file or environment",
        );
      }

      const client = postgres(process.env.DATABASE_URL);
      db = drizzle(client, { schema });
      console.log(
        "Database connection initialized successfully (standalone mode)",
      );
    } catch (error) {
      console.error("Failed to initialize database connection:", error);
      throw error;
    }
  }
  return db;
}

class BlockETL {
  constructor() {
    this.rpc = new RPC();
  }

  /**
   * Process a single block and save it to the database
   * @param {number} height - The block height to process
   * @returns {Promise<object>} - The processed block data
   */
  async processBlock(height) {
    try {
      console.log(`Processing block at height ${height}...`);

      // Make sure db is initialized
      const database = await initDB();

      // Get block hash from height
      const blockHash = await this.rpc.getBlockHash(height);
      console.log(`Block hash: ${blockHash}`);

      // Get full block data (verbosity 2 for full tx details)
      const blockData = await this.rpc.getBlock(blockHash, 2);

      // Format data for insertion into the database
      const blockRecord = {
        hash: blockData.hash,
        height: blockData.height,
        version: blockData.version,
        prev_hash: blockData.previousblockhash,
        merkle_root: blockData.merkleroot,
        timestamp: new Date(blockData.time * 1000), // Convert Unix timestamp to Date
        bits: blockData.bits,
        nonce: blockData.nonce,
        size: blockData.size,
        chain_work: blockData.chainwork,
        processed_at: new Date(),
      };

      // Insert block data into the database
      console.log("Inserting block into database...");
      const result = await database.insert(schema.blocks).values(blockRecord)
        .returning();

      console.log(
        `Successfully saved block ${height} (${blockHash}) to the database`,
      );
      return result[0];
    } catch (error) {
      console.error(`Error processing block ${height}:`, error.message);
      throw error;
    }
  }
}

// Main function to run when script is executed directly
async function main() {
  try {
    // Check if a block height was provided as a command-line argument
    const blockHeight = parseInt(process.argv[2]);

    if (isNaN(blockHeight) || blockHeight < 0) {
      console.error(
        "Please provide a valid block height (a non-negative integer)",
      );
      process.exit(1);
    }

    console.log(`Starting ETL process for block ${blockHeight}`);

    const blockETL = new BlockETL();
    const result = await blockETL.processBlock(blockHeight);

    console.log("ETL process completed successfully");
    console.log("Block details:", result);

    process.exit(0);
  } catch (error) {
    console.error("ETL process failed:", error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ""))) {
  main();
}

export default BlockETL;
