import type {
  BlockTemplate,
  CoinbaseTransaction,
  Transaction,
} from "../types/bitcoin.ts";
import type { Result } from "../types/config.ts";

// Genesis block constants from Bitcoin Core
export const GENESIS_BLOCK_DATA = {
  hash: "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
  nonce: 2083236893,
  merkleroot:
    "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
  time: 1231006505,
  mediantime: 1231006505,
  bits: "1d00ffff",
  target: "00000000ffff0000000000000000000000000000000000000000000000000000",
  difficulty: 1,
  version: 1,
  height: 0,
  previousblockhash:
    "0000000000000000000000000000000000000000000000000000000000000000",
  // Genesis coinbase transaction
  coinbaseTxid:
    "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
  coinbaseMessage:
    "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks",
  coinbaseValue: 5000000000, // 50 BTC in satoshis
  payoutAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // Genesis block address
} as const;

/**
 * Creates the genesis block coinbase transaction
 */
export function createGenesisCoinbaseTransaction(): Result<
  CoinbaseTransaction
> {
  try {
    const coinbaseTransaction: CoinbaseTransaction = {
      version: 1,
      inputs: [{
        prevTxHash:
          "0000000000000000000000000000000000000000000000000000000000000000",
        prevOutputIndex: 0xFFFFFFFF,
        coinbaseScript:
          "04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73",
        sequence: 0xFFFFFFFF,
      }],
      outputs: [{
        value: GENESIS_BLOCK_DATA.coinbaseValue,
        scriptPubKey:
          "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac",
      }],
      locktime: 0,
      blockHeight: 0,
    };

    return { success: true, data: coinbaseTransaction };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Creates the genesis block transaction for the block template
 */
export function createGenesisTransaction(): Result<Transaction> {
  try {
    const transaction: Transaction = {
      data:
        "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000",
      txid: GENESIS_BLOCK_DATA.coinbaseTxid,
      hash: GENESIS_BLOCK_DATA.coinbaseTxid,
      depends: [],
      fee: 0,
      sigops: 1,
      weight: 324,
    };

    return { success: true, data: transaction };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Creates a block template that recreates the exact genesis block conditions
 */
export function createGenesisBlockTemplate(): Result<BlockTemplate> {
  try {
    const transactionResult = createGenesisTransaction();
    if (!transactionResult.success) {
      return transactionResult;
    }

    const genesisTemplate: BlockTemplate = {
      version: GENESIS_BLOCK_DATA.version,
      rules: [],
      vbavailable: {},
      vbrequired: 0,
      previousblockhash: GENESIS_BLOCK_DATA.previousblockhash,
      transactions: [transactionResult.data],
      coinbaseaux: {},
      coinbasevalue: GENESIS_BLOCK_DATA.coinbaseValue,
      longpollid: "genesis",
      target: GENESIS_BLOCK_DATA.target,
      mintime: GENESIS_BLOCK_DATA.time,
      mutable: [],
      noncerange: "00000000ffffffff",
      sigoplimit: 20000,
      sizelimit: 1000000,
      weightlimit: 4000000,
      curtime: GENESIS_BLOCK_DATA.time,
      bits: GENESIS_BLOCK_DATA.bits,
      height: GENESIS_BLOCK_DATA.height,
    };

    return { success: true, data: genesisTemplate };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validates that a mining result matches the expected genesis block
 */
export function validateGenesisBlockResult(
  hash: string,
  nonce: number,
  merkleRoot: string,
): Result<boolean> {
  const expectedHash = GENESIS_BLOCK_DATA.hash;
  const expectedNonce = GENESIS_BLOCK_DATA.nonce;
  const expectedMerkleRoot = GENESIS_BLOCK_DATA.merkleroot;

  if (hash !== expectedHash) {
    return {
      success: false,
      error: `Hash mismatch. Expected: ${expectedHash}, Got: ${hash}`,
    };
  }

  if (nonce !== expectedNonce) {
    return {
      success: false,
      error: `Nonce mismatch. Expected: ${expectedNonce}, Got: ${nonce}`,
    };
  }

  if (merkleRoot !== expectedMerkleRoot) {
    return {
      success: false,
      error:
        `Merkle root mismatch. Expected: ${expectedMerkleRoot}, Got: ${merkleRoot}`,
    };
  }

  return { success: true, data: true };
}

/**
 * Estimates time to find genesis block based on hash rate
 */
export function estimateGenesisBlockMiningTime(hashRatePerSecond: number): {
  averageTimeSeconds: number;
  probabilityIn10Minutes: number;
  probabilityIn1Hour: number;
} {
  // With difficulty 1 and known nonce 2083236893
  const expectedAttempts = GENESIS_BLOCK_DATA.nonce;
  const averageTimeSeconds = expectedAttempts / hashRatePerSecond;

  // Probability calculations (exponential distribution)
  const probabilityIn10Minutes = 1 - Math.exp(-(600 / averageTimeSeconds));
  const probabilityIn1Hour = 1 - Math.exp(-(3600 / averageTimeSeconds));

  return {
    averageTimeSeconds,
    probabilityIn10Minutes,
    probabilityIn1Hour,
  };
}
