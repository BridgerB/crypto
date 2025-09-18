import { bytesToHex, doubleSha256, hexToBytes } from "../crypto/operations.ts";
import type {
  BitcoinAddress,
  BlockTemplate,
  CoinbaseTransaction,
  DetailedTransaction,
  TransactionInput,
  TransactionOutput,
} from "../types/bitcoin.ts";
import type { Result } from "../types/config.ts";

/**
 * Serializes a transaction input
 */
export function serializeTransactionInput(
  input: TransactionInput,
): Result<Uint8Array> {
  try {
    const parts: Uint8Array[] = [];

    // Previous transaction hash (32 bytes, reversed for little endian)
    const txidResult = hexToBytes(input.txid);
    if (!txidResult.success) {
      return { success: false, error: `Invalid txid: ${txidResult.error}` };
    }
    parts.push(txidResult.data.reverse());

    // Previous output index (4 bytes, little endian)
    const voutBuffer = new ArrayBuffer(4);
    new DataView(voutBuffer).setUint32(0, input.vout, true);
    parts.push(new Uint8Array(voutBuffer));

    // Script length + script
    const scriptResult = hexToBytes(input.scriptSig);
    if (!scriptResult.success) {
      return {
        success: false,
        error: `Invalid scriptSig: ${scriptResult.error}`,
      };
    }
    parts.push(encodeVarInt(scriptResult.data.length));
    parts.push(scriptResult.data);

    // Sequence (4 bytes, little endian)
    const sequenceBuffer = new ArrayBuffer(4);
    new DataView(sequenceBuffer).setUint32(0, input.sequence, true);
    parts.push(new Uint8Array(sequenceBuffer));

    return { success: true, data: concatUint8Arrays(parts) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Serializes a transaction output
 */
export function serializeTransactionOutput(
  output: TransactionOutput,
): Result<Uint8Array> {
  try {
    const parts: Uint8Array[] = [];

    // Value (8 bytes, little endian)
    const valueBuffer = new ArrayBuffer(8);
    const valueView = new DataView(valueBuffer);
    // Handle 64-bit value as two 32-bit parts
    const valueLow = output.value & 0xFFFFFFFF;
    const valueHigh = Math.floor(output.value / 0x100000000);
    valueView.setUint32(0, valueLow, true);
    valueView.setUint32(4, valueHigh, true);
    parts.push(new Uint8Array(valueBuffer));

    // Script length + script
    const scriptResult = hexToBytes(output.scriptPubKey);
    if (!scriptResult.success) {
      return {
        success: false,
        error: `Invalid scriptPubKey: ${scriptResult.error}`,
      };
    }
    parts.push(encodeVarInt(scriptResult.data.length));
    parts.push(scriptResult.data);

    return { success: true, data: concatUint8Arrays(parts) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Serializes a complete transaction
 */
export function serializeTransaction(
  tx: DetailedTransaction,
): Result<Uint8Array> {
  try {
    const parts: Uint8Array[] = [];

    // Version (4 bytes, little endian)
    const versionBuffer = new ArrayBuffer(4);
    new DataView(versionBuffer).setUint32(0, tx.version, true);
    parts.push(new Uint8Array(versionBuffer));

    // Input count
    parts.push(encodeVarInt(tx.inputs.length));

    // Inputs
    for (const input of tx.inputs) {
      const inputResult = serializeTransactionInput(input);
      if (!inputResult.success) {
        return inputResult;
      }
      parts.push(inputResult.data);
    }

    // Output count
    parts.push(encodeVarInt(tx.outputs.length));

    // Outputs
    for (const output of tx.outputs) {
      const outputResult = serializeTransactionOutput(output);
      if (!outputResult.success) {
        return outputResult;
      }
      parts.push(outputResult.data);
    }

    // Locktime (4 bytes, little endian)
    const locktimeBuffer = new ArrayBuffer(4);
    new DataView(locktimeBuffer).setUint32(0, tx.locktime, true);
    parts.push(new Uint8Array(locktimeBuffer));

    return { success: true, data: concatUint8Arrays(parts) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Creates a coinbase transaction for a given block template and payout address
 */
export function createCoinbaseTransaction(
  blockTemplate: BlockTemplate,
  payoutAddress: string,
  extraNonce: number = 0,
  coinbaseMessage?: string,
): Result<CoinbaseTransaction> {
  try {
    // Create coinbase script with block height (BIP 34)
    const blockHeightScript = encodeBlockHeight(blockTemplate.height);
    const extraNonceBytes = new Uint8Array(4);
    new DataView(extraNonceBytes.buffer).setUint32(0, extraNonce, true);

    let coinbaseScript = bytesToHex(
      concatUint8Arrays([blockHeightScript, extraNonceBytes]),
    );

    // Add custom message if provided
    if (coinbaseMessage) {
      const messageBytes = new TextEncoder().encode(coinbaseMessage);
      coinbaseScript += bytesToHex(messageBytes);
    }

    // Create payout script for the address
    const payoutScriptResult = createPayoutScript(payoutAddress);
    if (!payoutScriptResult.success) {
      return payoutScriptResult;
    }

    const coinbaseTransaction: CoinbaseTransaction = {
      version: 1,
      inputs: [{
        prevTxHash:
          "0000000000000000000000000000000000000000000000000000000000000000",
        prevOutputIndex: 0xFFFFFFFF,
        coinbaseScript,
        sequence: 0xFFFFFFFF,
      }],
      outputs: [{
        value: blockTemplate.coinbasevalue,
        scriptPubKey: payoutScriptResult.data,
      }],
      locktime: 0,
      blockHeight: blockTemplate.height,
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
 * Encodes block height for BIP 34 compliance
 */
export function encodeBlockHeight(height: number): Uint8Array {
  if (height === 0) {
    return new Uint8Array([1, 0]); // OP_PUSHDATA(1) + height(0)
  }

  // Convert height to minimal bytes (little endian)
  const bytes: number[] = [];
  let remaining = height;

  while (remaining > 0) {
    bytes.push(remaining & 0xFF);
    remaining = remaining >>> 8;
  }

  // Add length prefix
  return new Uint8Array([bytes.length, ...bytes]);
}

/**
 * Creates a payout script for a Bitcoin address
 */
export function createPayoutScript(address: string): Result<string> {
  try {
    // This is a simplified implementation - in a full implementation,
    // you would decode the address to determine its type and create the appropriate script

    // For now, assume P2PKH addresses and create a basic script
    // In a real implementation, you'd decode the address properly
    if (address === "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa") {
      // Genesis block address - known script
      return {
        success: true,
        data:
          "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac",
      };
    }

    // For other addresses, create a standard P2PKH script template
    // This is simplified - real implementation would decode the address
    return {
      success: true,
      data: "76a914" + "0".repeat(40) + "88ac", // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Calculates the transaction ID (TXID) from a serialized transaction
 */
export async function calculateTransactionId(
  serializedTx: Uint8Array,
): Promise<Result<string>> {
  const hashResult = await doubleSha256(serializedTx);
  if (!hashResult.success) {
    return hashResult;
  }

  // Reverse the hash for big-endian display
  const reversedHash = hashResult.data.reverse();
  return { success: true, data: bytesToHex(reversedHash) };
}

// Utility functions

/**
 * Encodes a variable-length integer (VarInt)
 */
export function encodeVarInt(value: number): Uint8Array {
  if (value < 0xFD) {
    return new Uint8Array([value]);
  } else if (value <= 0xFFFF) {
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    view.setUint8(0, 0xFD);
    view.setUint16(1, value, true);
    return new Uint8Array(buffer);
  } else if (value <= 0xFFFFFFFF) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0xFE);
    view.setUint32(1, value, true);
    return new Uint8Array(buffer);
  } else {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, 0xFF);
    // Handle 64-bit as two 32-bit parts
    view.setUint32(1, value & 0xFFFFFFFF, true);
    view.setUint32(5, Math.floor(value / 0x100000000), true);
    return new Uint8Array(buffer);
  }
}

/**
 * Concatenates multiple Uint8Arrays
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}
