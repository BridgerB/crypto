import {
  doubleSha256FromHex,
  doubleSha256Hex,
  sha256Hex,
} from "../crypto/operations.ts";
import {
  calculateMerkleRootFromTemplate,
  createBlockHeader,
  hashBlockHeader,
  serializeBlockHeader,
} from "../mining/core.ts";
import {
  logBlockHeaderConstruction,
  logCryptoTest,
  type Logger,
  logMiningData,
  logRealBitcoinData,
} from "./logger.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import type { Result } from "../types/config.ts";

export async function runCryptoTests(logger: Logger): Promise<Result<void>> {
  const testInput = "hello";
  const expectedSha256 =
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  const sha256Result = await sha256Hex(testInput);
  if (!sha256Result.success) {
    return {
      success: false,
      error: `SHA-256 test failed: ${sha256Result.error}`,
    };
  }

  const doubleSha256Result = await doubleSha256Hex(testInput);
  if (!doubleSha256Result.success) {
    return {
      success: false,
      error: `Double SHA-256 test failed: ${doubleSha256Result.error}`,
    };
  }

  logCryptoTest(
    testInput,
    expectedSha256,
    sha256Result.data,
    doubleSha256Result.data,
    logger,
  );
  return { success: true, data: undefined };
}

export async function testRealBitcoinData(
  blockTemplate: BlockTemplate,
  logger: Logger,
): Promise<Result<void>> {
  const prevBlockHashResult = await doubleSha256FromHex(
    blockTemplate.previousblockhash,
  );
  if (!prevBlockHashResult.success) {
    return {
      success: false,
      error: `Failed to hash previous block: ${prevBlockHashResult.error}`,
    };
  }

  const targetHashResult = await doubleSha256FromHex(blockTemplate.target);
  if (!targetHashResult.success) {
    return {
      success: false,
      error: `Failed to hash target: ${targetHashResult.error}`,
    };
  }

  logRealBitcoinData(
    blockTemplate,
    prevBlockHashResult.data,
    targetHashResult.data,
    logger,
  );
  return { success: true, data: undefined };
}

export async function testBlockHeaderConstruction(
  blockTemplate: BlockTemplate,
  logger: Logger,
): Promise<Result<void>> {
  // Calculate merkle root from block template
  const merkleResult = await calculateMerkleRootFromTemplate(blockTemplate);
  if (!merkleResult.success) {
    return {
      success: false,
      error: `Failed to calculate merkle root: ${merkleResult.error}`,
    };
  }

  const blockHeader = createBlockHeader(blockTemplate, merkleResult.data, 0);

  const serializationResult = serializeBlockHeader(blockHeader);
  if (!serializationResult.success) {
    return {
      success: false,
      error: `Failed to serialize block header: ${serializationResult.error}`,
    };
  }

  const hashResult = await hashBlockHeader(serializationResult.data);
  if (!hashResult.success) {
    return {
      success: false,
      error: `Failed to hash block header: ${hashResult.error}`,
    };
  }

  const isValid = hashResult.data < blockTemplate.target;
  const serializedHeaderHex = Array.from(serializationResult.data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  logBlockHeaderConstruction(
    blockTemplate,
    merkleResult.data,
    serializedHeaderHex,
    serializationResult.data.length,
    hashResult.data,
    isValid,
    logger,
  );

  return { success: true, data: undefined };
}

export function logBitcoinMiningData(
  blockTemplate: BlockTemplate,
  logger: Logger,
): void {
  logMiningData(blockTemplate, logger);
}
