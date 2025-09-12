// src/lib/server/db/schema.js
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Blocks table - core block data as it appears in the blockchain
export const blocks = pgTable("blocks", {
  // Block identification - exactly as in the blockchain
  hash: text("hash").primaryKey(), // Block hash - primary identifier
  height: bigint("height", { mode: "bigint" }).notNull().unique(), // Block height - for convenience

  // Block header fields - directly from the blockchain
  version: bigint("version", { mode: "bigint" }).notNull(), // Block version
  prev_hash: text("prev_hash").notNull(), // Previous block hash
  merkle_root: text("merkle_root").notNull(), // Merkle root hash
  timestamp: timestamp("timestamp").notNull(), // Block timestamp (UTC)
  bits: text("bits").notNull(), // Encoded difficulty target
  nonce: bigint("nonce", { mode: "bigint" }).notNull(), // Nonce value - change to bigint

  // Block metadata - directly from blockchain
  size: bigint("size", { mode: "bigint" }).notNull(), // Size in bytes - change to bigint
  chain_work: text("chain_work").notNull(), // Cumulative work done on this block

  // For database tracking only
  processed_at: timestamp("processed_at").defaultNow().notNull(), // When this block was processed
});

// Transactions table - raw transaction data
export const transactions = pgTable("transactions", {
  // Transaction identification
  txid: text("txid").primaryKey(), // Transaction ID

  // Block reference
  block_hash: text("block_hash")
    .notNull()
    .references(() => blocks.hash), // Block containing this tx

  // Raw transaction data
  version: bigint("version", { mode: "bigint" }).notNull(), // Transaction version - change to bigint
  locktime: bigint("locktime", { mode: "bigint" }).notNull(), // Transaction locktime - change to bigint
  size: bigint("size", { mode: "bigint" }).notNull(), // Transaction size in bytes - change to bigint
  fee: bigint("fee", { mode: "bigint" }).notNull(), // Transaction fee in satoshis - change to bigint

  // Position in block - useful for reconstructing block
  block_position: integer("block_position").notNull(), // Index within block

  // For database tracking only
  processed_at: timestamp("processed_at").defaultNow().notNull(),
});

// Transaction inputs - raw input data
export const transactionInputs = pgTable("transaction_inputs", {
  // Transaction reference
  txid: text("txid")
    .notNull()
    .references(() => transactions.txid), // Transaction this input belongs to

  // Input specific data
  input_index: integer("input_index").notNull(), // Input index (vin)

  // For regular inputs
  prev_txid: text("prev_txid"), // Previous transaction ID (null for coinbase)
  prev_vout: integer("prev_vout"), // Previous transaction output index (null for coinbase)
  script_sig: text("script_sig"), // Script signature (hex)
  sequence: bigint("sequence", { mode: "bigint" }).notNull(), // Sequence number

  // For coinbase inputs
  coinbase: text("coinbase"), // Coinbase data (hex, null for regular inputs)

  // Witness data (for segwit)
  witness: jsonb("witness"), // JSONB array of witness data (can be null for non-segwit)

  // For database tracking only
  processed_at: timestamp("processed_at").defaultNow().notNull(),
});

// Transaction outputs - raw output data
export const transactionOutputs = pgTable("transaction_outputs", {
  // Transaction reference
  txid: text("txid")
    .notNull()
    .references(() => transactions.txid), // Transaction this output belongs to

  // Output specific data
  output_index: integer("output_index").notNull(), // Output index (vout)
  value: bigint("value", { mode: "bigint" }).notNull(), // Value in satoshis
  script_pubkey: text("script_pubkey").notNull(), // Output script (hex)

  // For database tracking only
  processed_at: timestamp("processed_at").defaultNow().notNull(),
});
