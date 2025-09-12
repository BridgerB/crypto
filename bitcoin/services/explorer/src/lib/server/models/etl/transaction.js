// src/lib/server/models/etl/transaction.js
import RPC from "../../models/rpc.js";
import pkg from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
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

class TransactionETL {
  constructor() {
    this.rpc = new RPC();
  }

  /**
   * Check if block exists in the database and insert it if not
   * @param {string} blockHash - Block hash
   * @returns {Promise<boolean>} - True if block exists or was inserted, false otherwise
   */
  async ensureBlockExists(blockHash) {
    const database = await initDB();

    // Check if block exists
    const existingBlock = await database
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.hash, blockHash))
      .limit(1);

    if (existingBlock.length > 0) {
      console.log(`Block ${blockHash} already exists in database`);
      return true;
    }

    // Block doesn't exist, need to fetch and insert it
    console.log(
      `Block ${blockHash} not found in database. Creating block record first...`,
    );

    try {
      // Get block data
      const blockData = await this.rpc.getBlock(blockHash, 1);

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
      await database.insert(schema.blocks).values(blockRecord);
      console.log(
        `Successfully added block ${blockData.height} (${blockHash}) to the database`,
      );
      return true;
    } catch (error) {
      console.error(`Error ensuring block exists:`, error.message);
      return false;
    }
  }

  /**
   * Process all transactions in a block and save to database
   * @param {number|string} blockIdentifier - Block height or hash
   * @returns {Promise<object>} - Summary of processed transactions
   */
  async processBlockTransactions(blockIdentifier) {
    try {
      // Make sure db is initialized
      const database = await initDB();

      console.log(`Processing transactions for block ${blockIdentifier}...`);

      // Get block hash if height was provided
      let blockHash;
      if (
        typeof blockIdentifier === "number" || /^\d+$/.test(blockIdentifier)
      ) {
        blockHash = await this.rpc.getBlockHash(parseInt(blockIdentifier));
      } else {
        blockHash = blockIdentifier;
      }

      // Make sure the block exists in the database
      const blockExists = await this.ensureBlockExists(blockHash);
      if (!blockExists) {
        throw new Error(
          `Failed to ensure block ${blockHash} exists in database`,
        );
      }

      // Get the block with full transaction info
      const block = await this.rpc.getBlock(blockHash, 2);
      console.log(
        `Found ${block.tx.length} transactions in block ${block.height}`,
      );

      // Process all transactions in the block
      const results = {
        blockHeight: block.height,
        blockHash: block.hash,
        totalTransactions: block.tx.length,
        succeeded: 0,
        failed: 0,
        txids: [],
      };

      // Process transactions one by one
      for (let i = 0; i < block.tx.length; i++) {
        const tx = block.tx[i];
        try {
          console.log(
            `Processing transaction ${i + 1}/${block.tx.length}: ${tx.txid}`,
          );
          await this.processTransaction(tx, block.hash, i);
          results.succeeded++;
          results.txids.push(tx.txid);
        } catch (error) {
          console.error(
            `Failed to process transaction ${tx.txid}:`,
            error.message,
          );
          results.failed++;
        }
      }

      console.log(
        `Completed processing ${results.succeeded}/${block.tx.length} transactions`,
      );
      return results;
    } catch (error) {
      console.error(`Error processing block transactions:`, error.message);
      throw error;
    }
  }

  /**
   * Process a single transaction and save to database
   * @param {object} tx - Transaction data
   * @param {string} blockHash - Hash of the block containing this transaction
   * @param {number} blockPosition - Position of this transaction in the block
   * @returns {Promise<void>}
   */
  async processTransaction(tx, blockHash, blockPosition) {
    // Ensure database connection
    const database = await initDB();

    // Calculate fee - For now, just set to 0 for simplicity
    let fee = 0;

    // Insert transaction record
    const transactionRecord = {
      txid: tx.txid,
      block_hash: blockHash,
      version: tx.version,
      locktime: tx.locktime,
      size: tx.size,
      fee: fee,
      block_position: blockPosition,
      processed_at: new Date(),
    };

    // Insert the transaction
    await database.insert(schema.transactions).values(transactionRecord);

    // Process inputs
    await this.processInputs(tx.vin, tx.txid);

    // Process outputs
    await this.processOutputs(tx.vout, tx.txid);
  }

  /**
   * Process transaction inputs and save to database
   * @param {Array} inputs - Array of transaction inputs (vin)
   * @param {string} txid - Transaction ID these inputs belong to
   * @returns {Promise<void>}
   */
  async processInputs(inputs, txid) {
    const database = await initDB();

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];

      // Check if this is a coinbase input
      const isCoinbase = input.coinbase !== undefined;

      // Convert sequence to BigInt to handle large values
      // Check if your schema has been updated to use BigInt for sequence
      const sequence = BigInt(input.sequence);

      const inputRecord = {
        txid: txid,
        input_index: i,
        sequence: sequence, // Make sure your schema uses bigint for this field
        processed_at: new Date(),
      };

      if (isCoinbase) {
        // Coinbase input
        inputRecord.coinbase = input.coinbase;
      } else {
        // Regular input
        inputRecord.prev_txid = input.txid;
        inputRecord.prev_vout = input.vout;
        inputRecord.script_sig = input.scriptSig?.hex || null;

        // Handle witness data if present
        if (input.txinwitness && input.txinwitness.length > 0) {
          inputRecord.witness = input.txinwitness;
        }
      }

      // Insert the input record
      await database.insert(schema.transactionInputs).values(inputRecord);
    }
  }

  /**
   * Process transaction outputs and save to database
   * @param {Array} outputs - Array of transaction outputs (vout)
   * @param {string} txid - Transaction ID these outputs belong to
   * @returns {Promise<void>}
   */
  async processOutputs(outputs, txid) {
    const database = await initDB();

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i];

      // Convert BTC to satoshis for storage
      const valueSats = BigInt(Math.round(output.value * 100000000));

      const outputRecord = {
        txid: txid,
        output_index: output.n,
        value: valueSats,
        script_pubkey: output.scriptPubKey.hex,
        processed_at: new Date(),
      };

      // Insert the output record
      await database.insert(schema.transactionOutputs).values(outputRecord);
    }
  }

  /**
   * Process a specific transaction by txid
   * @param {string} txid - Transaction ID to process
   * @returns {Promise<object>} - Processed transaction data
   */
  async processSingleTransaction(txid) {
    try {
      console.log(`Processing single transaction ${txid}...`);

      // Get transaction data
      const tx = await this.rpc.getRawTransaction(txid, true);

      // Get the block this transaction is in
      if (!tx.blockhash) {
        throw new Error("Transaction not yet confirmed in a block");
      }

      // Make sure the block exists in the database
      const blockExists = await this.ensureBlockExists(tx.blockhash);
      if (!blockExists) {
        throw new Error(
          `Failed to ensure block ${tx.blockhash} exists in database`,
        );
      }

      // Get the block to find the transaction position
      const block = await this.rpc.getBlock(tx.blockhash, 1);

      // Find the position of this transaction in the block
      const blockPosition = block.tx.findIndex((id) => id === txid);
      if (blockPosition === -1) {
        throw new Error(
          "Transaction found in block but position cannot be determined",
        );
      }

      // Process the transaction
      await this.processTransaction(tx, tx.blockhash, blockPosition);

      return {
        txid: tx.txid,
        blockHash: tx.blockhash,
        blockHeight: tx.height,
        blockPosition: blockPosition,
        success: true,
      };
    } catch (error) {
      console.error(`Error processing transaction ${txid}:`, error.message);
      throw error;
    }
  }
}

// Main function to run when script is executed directly
async function main() {
  try {
    const blockIdentifier = process.argv[2];
    const txid = process.argv[3];

    if (!blockIdentifier) {
      console.error("Please provide a block height/hash or transaction ID");
      process.exit(1);
    }

    const txETL = new TransactionETL();

    // If txid is provided as the second argument, process just that transaction
    if (txid) {
      console.log(`Processing specific transaction ${txid}`);
      const result = await txETL.processSingleTransaction(txid);
      console.log("Transaction processed successfully:", result);
    } else {
      // Otherwise process all transactions in the block
      console.log(`Processing all transactions in block ${blockIdentifier}`);
      const results = await txETL.processBlockTransactions(blockIdentifier);
      console.log("Block transactions processed successfully:");
      console.log(
        `Total: ${results.totalTransactions}, Succeeded: ${results.succeeded}, Failed: ${results.failed}`,
      );
    }

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

export default TransactionETL;
