import { BITCOIN_CONSTANTS, DUMMY_VALUES } from "../utils/constants.ts";
import {
  bytesToHex,
  type CryptoResult,
  doubleSha256,
  hexToBytes,
} from "../crypto/operations.ts";
import type { BlockHeader, BlockTemplate } from "../types/bitcoin.ts";
import type { Result } from "../types/config.ts";

export function createDummyMerkleRoot(): string {
  return DUMMY_VALUES.MERKLE_ROOT;
}

export function createBlockHeader(
  blockTemplate: BlockTemplate,
  nonce: number = 0,
): BlockHeader {
  return {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot: createDummyMerkleRoot(),
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
    const reversedPrevHash = prevHashResult.data.reverse();
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
    const reversedMerkle = merkleResult.data.reverse();
    for (let i = 0; i < BITCOIN_CONSTANTS.HASH_LENGTH; i++) {
      view.setUint8(36 + i, reversedMerkle[i]);
    }

    view.setUint32(68, header.time, true);

    const bitsResult = hexToBytes(header.bits);
    if (!bitsResult.success) {
      return { success: false, error: `Invalid bits: ${bitsResult.error}` };
    }
    const reversedBits = bitsResult.data.reverse();
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

  return { success: true, data: bytesToHex(hashResult.data) };
}

export function isValidHash(hash: string, target: string): boolean {
  return hash < target;
}

export async function mineAttempt(
  blockTemplate: BlockTemplate,
  nonce: number,
): Promise<Result<{ hash: string; valid: boolean }>> {
  const header = createBlockHeader(blockTemplate, nonce);

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

export function calculateNonceRanges(
  workerCount: number,
  maxNonce: number,
): Array<{ start: number; end: number }> {
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
