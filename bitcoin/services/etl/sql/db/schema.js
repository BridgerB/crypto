// db/schema.js - Updated schema with unique constraints
import {
  bigint,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const block = pgTable("block", {
  id: serial("id").primaryKey(),
  blockHeight: integer("block_height").notNull().unique(), // Add unique constraint
  hash: text("hash").notNull().unique(), // Add unique constraint
  version: integer("version").notNull(),
  merkleRoot: text("merkle_root").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  bits: bigint("bits", { mode: "bigint" }).notNull(),
  nonce: bigint("nonce", { mode: "bigint" }).notNull(),
  size: bigint("size", { mode: "bigint" }).notNull(),
  weight: bigint("weight", { mode: "bigint" }).notNull(),
  reward: bigint("reward", { mode: "bigint" }).notNull(),
  fees: bigint("fees", { mode: "bigint" }).notNull(),
});

export const transaction = pgTable("transaction", {
  id: serial("id").primaryKey(),
  txHash: text("tx_hash").notNull().unique(), // Add unique constraint
  blockHeight: integer("block_height"),
  version: integer("version").notNull(),
  size: bigint("size", { mode: "bigint" }).notNull(),
  weight: bigint("weight", { mode: "bigint" }).notNull(),
  locktime: bigint("locktime", { mode: "bigint" }).notNull(),
  isCoinbase: boolean("is_coinbase").notNull(),
  position: integer("position").notNull(),
  fee: bigint("fee", { mode: "bigint" }).notNull(),
  type: text("type").notNull().default("UNKNOWN"),
});

export const output = pgTable(
  "output",
  {
    id: serial("id").primaryKey(),
    txHash: text("tx_hash").notNull(),
    position: integer("position").notNull(),
    value: bigint("value", { mode: "bigint" }).notNull(),
    scriptPubkey: text("script_pubkey").notNull(),
    address: text("address"),
    addressType: text("address_type"),
    scriptType: text("script_type").notNull(),
  },
  (table) => ({
    // Composite unique constraint for tx_hash + position
    unq: unique().on(table.txHash, table.position),
  }),
);

export const input = pgTable(
  "input",
  {
    id: serial("id").primaryKey(),
    txHash: text("tx_hash").notNull(),
    position: integer("position").notNull(),
    prevTxHash: text("prev_tx_hash"),
    prevPosition: integer("prev_position"),
    scriptSig: text("script_sig"),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    witness: text("witness"),
    scriptType: text("script_type"),
  },
  (table) => ({
    // Composite unique constraint for tx_hash + position
    unq: unique().on(table.txHash, table.position),
  }),
);
