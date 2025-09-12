// src/lib/server/models/block.js
import crypto from "crypto";
import bs58 from "bs58";
import RPC from "./rpc.js";

class Block {
  constructor() {
    // Configuration
    this.BATCH_SIZE = 50; // Process transactions in batches of 50
    this.rpc = new RPC(); // Use the RPC class
  }

  /**
   * Get output addresses and amounts for a specific block height
   * @param {number} blockHeight - The block height to analyze
   * @param {boolean} showProgress - Whether to show progress updates
   * @returns {Promise<object>} - JSON object with addresses as keys and amounts as values
   */
  async getOutputs(blockHeight, showProgress = true) {
    try {
      // Get block hash from height (fast operation)
      const blockHash = await this.rpc.getBlockHash(blockHeight);

      // Get block data without full transaction details (much faster)
      const blockData = await this.rpc.getBlock(blockHash, 1);

      // Process transactions in batches
      const addressAmounts = await this.processTransactionsInBatches(
        blockData,
        blockHash,
        blockHeight,
        showProgress,
      );

      return addressAmounts;
    } catch (error) {
      console.error(
        `Error getting outputs for block ${blockHeight}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Process block transactions in batches for better performance
   * @param {object} blockData - Basic block data with transaction IDs
   * @param {string} blockHash - Block hash
   * @param {number} blockHeight - Block height
   * @param {boolean} showProgress - Whether to show progress updates
   * @returns {Promise<object>} - Address to amount mapping
   */
  async processTransactionsInBatches(
    blockData,
    blockHash,
    blockHeight,
    showProgress,
  ) {
    const addressAmounts = {};
    const totalTxs = blockData.tx.length;

    if (showProgress) {
      console.log(
        `Processing ${totalTxs} transactions in batches of ${this.BATCH_SIZE}...`,
      );
    }

    // Special case for genesis block
    if (
      blockHeight === 0 &&
      totalTxs === 1 &&
      blockData.tx[0] ===
        "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"
    ) {
      addressAmounts["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"] = 50;
      return addressAmounts;
    }

    // Process in batches
    for (let i = 0; i < totalTxs; i += this.BATCH_SIZE) {
      // Create a batch of promises for parallel processing
      const batch = blockData.tx.slice(i, i + this.BATCH_SIZE);
      const batchPromises = batch.map((txid) =>
        this.processTransaction(txid, blockHash, blockHeight)
      );

      // Process batch in parallel
      const batchResults = await Promise.all(batchPromises);

      // Merge batch results into main addressAmounts object
      batchResults.forEach((txOutputs) => {
        Object.entries(txOutputs).forEach(([address, amount]) => {
          addressAmounts[address] = (addressAmounts[address] || 0) + amount;
        });
      });

      if (showProgress) {
        const processed = Math.min(i + this.BATCH_SIZE, totalTxs);
        const percentage = Math.round((processed / totalTxs) * 100);
        console.log(
          `Processed ${processed}/${totalTxs} transactions (${percentage}%)`,
        );
      }
    }

    return addressAmounts;
  }

  /**
   * Process a single transaction and extract output addresses and amounts
   * @param {string} txid - Transaction ID
   * @param {string} blockHash - Block hash (for transaction lookup)
   * @param {number} blockHeight - Block height
   * @returns {Promise<object>} - Map of addresses to amounts for this transaction
   */
  async processTransaction(txid, blockHash, blockHeight) {
    try {
      // Special case for genesis block coinbase
      if (
        blockHeight === 0 &&
        txid ===
          "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"
      ) {
        return {
          "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": 50,
        };
      }

      // Get raw transaction with outputs
      const tx = await this.rpc.getRawTransaction(txid, true, blockHash);

      // Process outputs for this transaction
      return this.extractAddressesFromTransaction(tx);
    } catch (error) {
      console.error(`Error processing transaction ${txid}: ${error.message}`);
      return {};
    }
  }

  /**
   * Extract addresses and amounts from a single transaction
   * @param {object} tx - Transaction data
   * @returns {object} - Map of addresses to amounts
   */
  extractAddressesFromTransaction(tx) {
    const txOutputs = {};

    if (!tx.vout || !Array.isArray(tx.vout)) {
      return txOutputs;
    }

    for (const output of tx.vout) {
      if (!output.scriptPubKey) {
        continue;
      }

      const amount = parseFloat(output.value);

      // Different Bitcoin Core versions have different output formats
      if (
        output.scriptPubKey.addresses &&
        Array.isArray(output.scriptPubKey.addresses)
      ) {
        // Multiple addresses (multisig)
        output.scriptPubKey.addresses.forEach((addr) => {
          txOutputs[addr] = (txOutputs[addr] || 0) +
            amount / output.scriptPubKey.addresses.length;
        });
      } else if (output.scriptPubKey.address) {
        // Single address
        const address = output.scriptPubKey.address;
        txOutputs[address] = (txOutputs[address] || 0) + amount;
      } else if (
        output.scriptPubKey.type === "pubkey" && output.scriptPubKey.asm
      ) {
        // Early Bitcoin blocks used pubkey format instead of addresses
        const pubkey = this.extractPubkeyFromAsm(output.scriptPubKey.asm);
        if (pubkey) {
          // Convert pubkey to address using our own function
          try {
            const address = this.pubkeyToAddress(pubkey);
            if (address) {
              txOutputs[address] = (txOutputs[address] || 0) + amount;
            }
          } catch (error) {
            console.error(
              `Error converting pubkey to address: ${error.message}`,
            );
          }
        }
      }
      // Note: we don't track nulldata/OP_RETURN or other non-standard outputs
    }

    return txOutputs;
  }

  /**
   * Extract a public key from scriptPubKey ASM
   * @param {string} asm - The scriptPubKey ASM string
   * @returns {string|null} - The extracted public key or null
   */
  extractPubkeyFromAsm(asm) {
    // In early Bitcoin transactions, the scriptPubKey for pubkey type usually looks like:
    // "<pubkey> OP_CHECKSIG" in the ASM representation
    const parts = asm.split(" ");
    if (parts.length >= 2 && parts[1] === "OP_CHECKSIG") {
      return parts[0];
    }
    return null;
  }

  /**
   * Manual pubkey to address conversion for early Bitcoin blocks
   * Now using bs58 package for Base58 encoding
   * @param {string} pubkeyHex - Hex string of the public key
   * @returns {string} - The Bitcoin address
   */
  pubkeyToAddress(pubkeyHex) {
    try {
      // Step 1: SHA-256 hash of the public key
      const sha256 = crypto.createHash("sha256").update(
        Buffer.from(pubkeyHex, "hex"),
      ).digest();

      // Step 2: RIPEMD-160 hash of the result
      const ripemd160 = crypto.createHash("ripemd160").update(sha256).digest();

      // Step 3: Add version byte (0x00 for mainnet)
      const versionedPayload = Buffer.concat([Buffer.from([0x00]), ripemd160]);

      // Step 4: SHA-256 hash of the versioned payload
      const checksum1 = crypto.createHash("sha256").update(versionedPayload)
        .digest();

      // Step 5: SHA-256 hash of the result
      const checksum2 = crypto.createHash("sha256").update(checksum1).digest();

      // Step 6: First 4 bytes of the second SHA-256 hash for the checksum
      const checksum = checksum2.slice(0, 4);

      // Step 7: Add the 4 checksum bytes to the versioned payload
      const binaryAddress = Buffer.concat([versionedPayload, checksum]);

      // Step 8: Base58 encode the binary address using bs58 package
      return bs58.encode(binaryAddress);
    } catch (error) {
      console.error(`Error in pubkey to address conversion: ${error.message}`);
      return null;
    }
  }
}

export default Block;
