// src/lib/server/models/transaction.js
import RPC from "./rpc.js";

class Transaction {
  constructor() {
    // Initialize the RPC helper
    this.rpc = new RPC();
  }

  /**
   * Get detailed transaction data by transaction ID
   * @param {string} txid - Transaction ID to look up
   * @returns {Promise<object>} - Formatted transaction details
   */
  async getTransaction(txid) {
    try {
      // Get the raw transaction data
      const tx = await this.rpc.getRawTransaction(txid, true);

      // Format the transaction data
      return this.formatTransaction(tx);
    } catch (error) {
      console.error(`Error getting transaction ${txid}:`, error.message);
      throw error;
    }
  }

  /**
   * Format transaction data for display
   * @param {object} tx - Raw transaction data from RPC
   * @returns {object} - Formatted transaction data
   */
  formatTransaction(tx) {
    // Basic transaction info
    const formattedTx = {
      txid: tx.txid,
      hash: tx.hash,
      version: tx.version,
      size: tx.size,
      vsize: tx.vsize,
      weight: tx.weight,
      locktime: tx.locktime,

      // Block info
      blockhash: tx.blockhash,
      confirmations: tx.confirmations,
      time: tx.time,
      blocktime: tx.blocktime,

      // Format the timestamps into readable dates
      timeFormatted: this.formatTimestamp(tx.time),
      blocktimeFormatted: this.formatTimestamp(tx.blocktime),

      // Process inputs and outputs
      vin: this.formatInputs(tx.vin),
      vout: this.formatOutputs(tx.vout),

      // Calculate total input and output values
      totalInput: 0, // Will be calculated if input transactions are available
      totalOutput: this.calculateTotalOutput(tx.vout),
    };

    // Calculate fee if possible (may not be possible for coinbase txs)
    if (formattedTx.totalInput > 0) {
      formattedTx.fee = formattedTx.totalInput - formattedTx.totalOutput;
      formattedTx.feeRate = (formattedTx.fee / tx.size) * 1000; // fee per KB
    }

    return formattedTx;
  }

  /**
   * Format timestamp to human-readable date
   * @param {number} timestamp - Unix timestamp
   * @returns {string} - Formatted date string
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  /**
   * Format transaction inputs
   * @param {array} vin - Array of transaction inputs
   * @returns {array} - Formatted transaction inputs
   */
  formatInputs(vin) {
    if (!vin || !Array.isArray(vin)) return [];

    return vin.map((input, index) => {
      // Check if coinbase transaction
      if (input.coinbase) {
        return {
          index,
          coinbase: input.coinbase,
          sequence: input.sequence,
          isCoinbase: true,
          value: "Newly Generated Coins",
          address: "Coinbase (Newly Generated Coins)",
        };
      }

      // Regular transaction input
      return {
        index,
        txid: input.txid,
        vout: input.vout,
        scriptSig: input.scriptSig,
        sequence: input.sequence,
        value: input.value, // May be available in some RPC results
        address: input.address, // May be available in some RPC results
        isCoinbase: false,
      };
    });
  }

  /**
   * Format transaction outputs
   * @param {array} vout - Array of transaction outputs
   * @returns {array} - Formatted transaction outputs
   */
  formatOutputs(vout) {
    if (!vout || !Array.isArray(vout)) return [];

    return vout.map((output) => {
      const formatted = {
        n: output.n,
        value: output.value,
        scriptPubKey: output.scriptPubKey,
        type: output.scriptPubKey.type,
        addresses: [],
      };

      // Extract addresses
      if (
        output.scriptPubKey.addresses &&
        Array.isArray(output.scriptPubKey.addresses)
      ) {
        formatted.addresses = output.scriptPubKey.addresses;
      } else if (output.scriptPubKey.address) {
        formatted.addresses = [output.scriptPubKey.address];
      }

      return formatted;
    });
  }

  /**
   * Calculate total output value of a transaction
   * @param {array} vout - Array of transaction outputs
   * @returns {number} - Total output value in BTC
   */
  calculateTotalOutput(vout) {
    if (!vout || !Array.isArray(vout)) return 0;

    return vout.reduce((total, output) => {
      return total + (parseFloat(output.value) || 0);
    }, 0);
  }

  /**
   * Get related transactions (inputs/outputs) for a given transaction
   * @param {string} txid - Transaction ID
   * @returns {Promise<object>} - Object containing input and output transactions
   */
  async getRelatedTransactions(txid) {
    try {
      const tx = await this.rpc.getRawTransaction(txid, true);

      // For inputs, get the transactions that were spent in this transaction
      const inputTxPromises = tx.vin
        .filter((input) => !input.coinbase) // Skip coinbase inputs
        .map((input) => this.getTransaction(input.txid));

      // Get spending transactions in parallel
      const inputTxs = await Promise.all(inputTxPromises);

      return {
        inputs: inputTxs,
        // We don't automatically fetch spending transactions (would require index)
        outputs: [],
      };
    } catch (error) {
      console.error(
        `Error getting related transactions for ${txid}:`,
        error.message,
      );
      throw error;
    }
  }
}

export default Transaction;
