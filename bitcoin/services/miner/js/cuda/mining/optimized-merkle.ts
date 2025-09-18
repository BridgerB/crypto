import type { Result } from "../types/config.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import { bytesToHex, doubleSha256 } from "../crypto/operations.ts";

interface CachedMerkleCalculator {
  baseCoinbaseData: Uint8Array;
  extraNonceOffset: number;
  otherTransactions: any[];
  calculateForExtraNonce: (extraNonce: number) => Promise<Result<string>>;
}

/**
 * Creates an optimized merkle root calculator that caches coinbase structure
 * and only updates the extraNonce field for different values
 */
export async function createCachedMerkleCalculator(
  blockTemplate: BlockTemplate,
  payoutAddress: string = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
): Promise<Result<CachedMerkleCalculator>> {
  try {
    // Import transaction utilities
    const {
      createCoinbaseTransaction,
      serializeTransaction,
      calculateTransactionId,
    } = await import("./transaction.ts");
    const { buildMerkleTree } = await import("./core.ts");

    // Create a base coinbase transaction with extraNonce = 0
    const baseCoinbaseResult = createCoinbaseTransaction(
      blockTemplate,
      payoutAddress,
      0, // Base extraNonce
      "CUDA Miner",
    );

    if (!baseCoinbaseResult.success) {
      return {
        success: false,
        error: `Failed to create base coinbase: ${baseCoinbaseResult.error}`,
      };
    }

    // Serialize the base coinbase to find extraNonce offset
    const baseCoinbaseDetailedTx = {
      version: baseCoinbaseResult.data.version,
      inputs: baseCoinbaseResult.data.inputs.map((input) => ({
        txid: input.prevTxHash,
        vout: input.prevOutputIndex,
        scriptSig: input.coinbaseScript,
        sequence: input.sequence,
      })),
      outputs: baseCoinbaseResult.data.outputs.map((output) => ({
        value: output.value,
        scriptPubKey: output.scriptPubKey,
      })),
      locktime: baseCoinbaseResult.data.locktime,
    };

    const serializedBaseCoinbase = serializeTransaction(baseCoinbaseDetailedTx);
    if (!serializedBaseCoinbase.success) {
      return {
        success: false,
        error:
          `Failed to serialize base coinbase: ${serializedBaseCoinbase.error}`,
      };
    }

    // Find the extraNonce offset in the serialized coinbase
    // ExtraNonce is 4 bytes after the block height in the coinbase script
    const baseCoinbaseData = serializedBaseCoinbase.data;
    const extraNonceOffset = findExtraNonceOffset(baseCoinbaseData);

    const calculator: CachedMerkleCalculator = {
      baseCoinbaseData,
      extraNonceOffset,
      otherTransactions: blockTemplate.transactions,

      calculateForExtraNonce: async (
        extraNonce: number,
      ): Promise<Result<string>> => {
        try {
          // Create a copy of the base coinbase data
          const modifiedCoinbaseData = new Uint8Array(baseCoinbaseData);

          // Update the extraNonce bytes (4 bytes, little endian)
          const extraNonceView = new DataView(
            modifiedCoinbaseData.buffer,
            extraNonceOffset,
            4,
          );
          extraNonceView.setUint32(0, extraNonce, true);

          // Calculate the TXID of the modified coinbase
          const coinbaseTxidResult = await calculateTransactionId(
            modifiedCoinbaseData,
          );
          if (!coinbaseTxidResult.success) {
            return {
              success: false,
              error:
                `Failed to calculate modified coinbase TXID: ${coinbaseTxidResult.error}`,
            };
          }

          // Build transaction list with the new coinbase
          const allTransactions = [
            {
              txid: coinbaseTxidResult.data,
              hash: coinbaseTxidResult.data,
              depends: [],
              fee: 0,
              sigops: 0,
              weight: modifiedCoinbaseData.length * 4,
              data: bytesToHex(modifiedCoinbaseData),
            },
            ...calculator.otherTransactions,
          ];

          // Calculate merkle root with cached structure
          const txHashes = allTransactions.map((tx) => tx.hash || tx.txid);
          return await buildMerkleTree(txHashes);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    };

    return { success: true, data: calculator };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Finds the offset of the extraNonce field in the serialized coinbase transaction
 */
function findExtraNonceOffset(coinbaseData: Uint8Array): number {
  // The extraNonce is located after:
  // - Version (4 bytes)
  // - Input count (1 byte, assuming single input)
  // - Previous TX hash (32 bytes of zeros)
  // - Previous output index (4 bytes, 0xFFFFFFFF)
  // - Script length (VarInt, usually 1 byte for small scripts)
  // - Block height script (variable length)
  // The extraNonce is the next 4 bytes after the block height

  // Start after: version(4) + input_count(1) + prev_hash(32) + prev_index(4) = 41 bytes
  let offset = 41;

  // Read script length (assuming 1 byte VarInt for typical coinbase scripts)
  const scriptLength = coinbaseData[offset];
  offset += 1;

  // Skip block height encoding (first byte is length, then the height bytes)
  const blockHeightLength = coinbaseData[offset];
  offset += 1 + blockHeightLength;

  // ExtraNonce is at this offset (4 bytes)
  return offset;
}
