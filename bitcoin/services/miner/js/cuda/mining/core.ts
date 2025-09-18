import { BITCOIN_CONSTANTS } from "../utils/constants.ts";
import {
  bytesToHex,
  type CryptoResult,
  doubleSha256,
  hexToBytes,
} from "../crypto/operations.ts";
import type {
  BlockHeader,
  BlockTemplate,
  Transaction,
} from "../types/bitcoin.ts";
import type { Result } from "../types/config.ts";

// Real merkle tree calculation functions
export async function calculateMerkleRoot(
  transactions: Transaction[],
): Promise<Result<string>> {
  if (transactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  // Extract transaction hashes (they are already hashed in the BlockTemplate)
  const txHashes = transactions.map((tx) => tx.hash);

  return await buildMerkleTree(txHashes);
}

export async function buildMerkleTree(
  txHashes: string[],
): Promise<Result<string>> {
  if (txHashes.length === 0) {
    return { success: false, error: "No transaction hashes provided" };
  }

  let currentLevel = [...txHashes];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];

    // If odd number of hashes, duplicate the last one
    if (currentLevel.length % 2 === 1) {
      currentLevel.push(currentLevel[currentLevel.length - 1]);
    }

    // Process pairs of hashes
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];

      // Concatenate the two hashes and reverse them (little endian)
      const leftBytes = hexToBytes(left);
      const rightBytes = hexToBytes(right);

      if (!leftBytes.success || !rightBytes.success) {
        return { success: false, error: "Invalid transaction hash format" };
      }

      // Reverse for little endian, concatenate, then hash
      const leftReversed = [...leftBytes.data].reverse();
      const rightReversed = [...rightBytes.data].reverse();
      const combined = new Uint8Array(
        leftReversed.length + rightReversed.length,
      );
      combined.set(leftReversed, 0);
      combined.set(rightReversed, leftReversed.length);

      // Double SHA-256 and reverse result back to big endian
      const hashResult = await doubleSha256(combined);
      if (!hashResult.success) {
        return { success: false, error: hashResult.error };
      }

      const reversedResult = [...hashResult.data].reverse();
      nextLevel.push(bytesToHex(reversedResult));
    }

    currentLevel = nextLevel;
  }

  return { success: true, data: currentLevel[0] };
}

export async function calculateMerkleRootFromTemplate(
  blockTemplate: BlockTemplate,
  extraNonce: number = 0,
): Promise<Result<string>> {
  let transactions = blockTemplate.transactions;

  // If no transactions, we need to create a coinbase transaction
  if (transactions.length === 0) {
    // For live mining with no transactions, create a placeholder coinbase transaction
    // In a full implementation, this would properly serialize and hash the coinbase transaction
    const coinbaseTxid =
      "0000000000000000000000000000000000000000000000000000000000000000";

    transactions = [{
      txid: coinbaseTxid,
      hash: coinbaseTxid,
      depends: [],
      fee: 0,
      sigops: 0,
      weight: 1000,
      data: "",
    }];
  }

  return await calculateMerkleRoot(transactions);
}

export async function calculateMerkleRootWithExtraNonce(
  blockTemplate: BlockTemplate,
  extraNonce: number,
  payoutAddress: string = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
): Promise<Result<string>> {
  // Import transaction utilities
  const {
    createCoinbaseTransaction,
    serializeTransaction,
    calculateTransactionId,
  } = await import("./transaction.ts");

  let transactions = [...blockTemplate.transactions];

  // Always create a proper coinbase transaction with extraNonce
  const coinbaseResult = createCoinbaseTransaction(
    blockTemplate,
    payoutAddress,
    extraNonce,
    "CUDA Miner",
  );

  if (!coinbaseResult.success) {
    return {
      success: false,
      error: `Failed to create coinbase: ${coinbaseResult.error}`,
    };
  }

  // Serialize and hash the coinbase transaction
  const coinbaseDetailedTx = {
    version: coinbaseResult.data.version,
    inputs: coinbaseResult.data.inputs.map((input) => ({
      txid: input.prevTxHash,
      vout: input.prevOutputIndex,
      scriptSig: input.coinbaseScript,
      sequence: input.sequence,
    })),
    outputs: coinbaseResult.data.outputs.map((output) => ({
      value: output.value,
      scriptPubKey: output.scriptPubKey,
    })),
    locktime: coinbaseResult.data.locktime,
  };

  const serializedCoinbase = serializeTransaction(coinbaseDetailedTx);
  if (!serializedCoinbase.success) {
    return {
      success: false,
      error: `Failed to serialize coinbase: ${serializedCoinbase.error}`,
    };
  }

  const coinbaseTxidResult = await calculateTransactionId(
    serializedCoinbase.data,
  );
  if (!coinbaseTxidResult.success) {
    return {
      success: false,
      error: `Failed to calculate coinbase TXID: ${coinbaseTxidResult.error}`,
    };
  }

  // Create transaction object for merkle tree
  const coinbaseTx = {
    txid: coinbaseTxidResult.data,
    hash: coinbaseTxidResult.data,
    depends: [],
    fee: 0,
    sigops: 0,
    weight: serializedCoinbase.data.length * 4,
    data: bytesToHex(serializedCoinbase.data),
  };

  // Add coinbase as first transaction
  transactions.unshift(coinbaseTx);

  return await calculateMerkleRoot(transactions);
}

export function createBlockHeader(
  blockTemplate: BlockTemplate,
  merkleRoot: string,
  nonce: number = 0,
): BlockHeader {
  return {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot,
    time: blockTemplate.curtime,
    bits: blockTemplate.bits,
    nonce,
  };
}

export function serializeBlockHeader(header: BlockHeader): Result<Uint8Array> {
  try {
    const buffer = new ArrayBuffer(BITCOIN_CONSTANTS.BLOCK_HEADER_SIZE);
    const view = new DataView(buffer);

    view.setUint32(0, header.version, true);

    const prevHashResult = hexToBytes(header.previousBlockHash);
    if (!prevHashResult.success) {
      return {
        success: false,
        error: `Invalid previous block hash: ${prevHashResult.error}`,
      };
    }
    const reversedPrevHash = [...prevHashResult.data].reverse();
    for (let i = 0; i < BITCOIN_CONSTANTS.HASH_LENGTH; i++) {
      view.setUint8(4 + i, reversedPrevHash[i]);
    }

    const merkleResult = hexToBytes(header.merkleRoot);
    if (!merkleResult.success) {
      return {
        success: false,
        error: `Invalid merkle root: ${merkleResult.error}`,
      };
    }
    const reversedMerkle = [...merkleResult.data].reverse();
    for (let i = 0; i < BITCOIN_CONSTANTS.HASH_LENGTH; i++) {
      view.setUint8(36 + i, reversedMerkle[i]);
    }

    view.setUint32(68, header.time, true);

    const bitsResult = hexToBytes(header.bits);
    if (!bitsResult.success) {
      return { success: false, error: `Invalid bits: ${bitsResult.error}` };
    }
    const reversedBits = [...bitsResult.data].reverse();
    for (let i = 0; i < 4; i++) {
      view.setUint8(72 + i, reversedBits[i]);
    }

    view.setUint32(76, header.nonce, true);

    return { success: true, data: new Uint8Array(buffer) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function hashBlockHeader(
  serializedHeader: Uint8Array,
): Promise<CryptoResult<string>> {
  const hashResult = await doubleSha256(serializedHeader);
  if (!hashResult.success) {
    return hashResult;
  }

  // Reverse bytes for big-endian display (Bitcoin convention)
  const reversedHash = [...hashResult.data].reverse();
  return { success: true, data: bytesToHex(reversedHash) };
}

export function isValidHash(hash: string, target: string): boolean {
  return BigInt(`0x${hash}`) < BigInt(`0x${target}`);
}

export async function mineAttempt(
  blockTemplate: BlockTemplate,
  nonce: number,
  merkleRoot?: string,
): Promise<Result<{ hash: string; valid: boolean }>> {
  // Calculate merkle root if not provided
  let finalMerkleRoot = merkleRoot;
  if (!finalMerkleRoot) {
    const merkleResult = await calculateMerkleRootFromTemplate(blockTemplate);
    if (!merkleResult.success) {
      return merkleResult;
    }
    finalMerkleRoot = merkleResult.data;
  }

  const header = createBlockHeader(blockTemplate, finalMerkleRoot, nonce);

  const serializationResult = serializeBlockHeader(header);
  if (!serializationResult.success) {
    return serializationResult;
  }

  const hashResult = await hashBlockHeader(serializationResult.data);
  if (!hashResult.success) {
    return { success: false, error: hashResult.error };
  }

  const valid = isValidHash(hashResult.data, blockTemplate.target);

  return {
    success: true,
    data: {
      hash: hashResult.data,
      valid,
    },
  };
}

export async function serializeBlockHeaderForCuda(
  blockTemplate: BlockTemplate,
  nonce: number,
): Promise<Result<string>> {
  try {
    // Calculate merkle root first
    const merkleResult = await calculateMerkleRootFromTemplate(blockTemplate);
    if (!merkleResult.success) {
      return {
        success: false,
        error: `Failed to calculate merkle root: ${merkleResult.error}`,
      };
    }

    const header = createBlockHeader(blockTemplate, merkleResult.data, nonce);
    const serializationResult = serializeBlockHeader(header);

    if (!serializationResult.success) {
      return {
        success: false,
        error: `Failed to serialize header: ${serializationResult.error}`,
      };
    }

    // Convert to hex string (160 characters for 80 bytes)
    const hexString = Array.from(
      serializationResult.data,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    return { success: true, data: hexString };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function calculateNonceRanges(
  workerCount: number,
  maxNonce: number,
  isGenesis: boolean = false,
): Array<{ start: number; end: number }> {
  // Always use the same range calculation - no special genesis handling
  // Let the workers naturally discover the winning nonce
  const nonceRangeSize = Math.floor(maxNonce / workerCount);
  const ranges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < workerCount; i++) {
    const start = i * nonceRangeSize;
    const end = (i === workerCount - 1)
      ? maxNonce
      : (i + 1) * nonceRangeSize - 1;
    ranges.push({ start, end });
  }

  return ranges;
}

export function countLeadingZeros(hexString: string): number {
  let count = 0;
  for (const char of hexString) {
    if (char === "0") count++;
    else break;
  }
  return count;
}

export function calculateDifficulty(target: string): number {
  const targetBig = BigInt("0x" + target);
  const maxTarget = BigInt(
    "0x" + "f".repeat(BITCOIN_CONSTANTS.HASH_HEX_LENGTH),
  );
  return Number(maxTarget / targetBig);
}
