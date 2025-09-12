// src/lib/server/models/address.js
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import net from "net";

const execAsync = promisify(exec);

class Address {
  constructor() {
    // Configuration
    this.ELECTRUM_HOST = "127.0.0.1";
    this.ELECTRUM_PORT = 50001;
    this.RPC_USER = "bridger";
    this.RPC_PASS = "password";
  }

  /**
   * Get the balance of a Bitcoin address
   * @param {string} address - Bitcoin address to check
   * @returns {Promise<object>} - Object containing balance information
   */
  async getBalance(address) {
    try {
      // Get scriptPubKey
      const scriptPubKey = await this.getScriptPubKey(address);

      // Convert to scripthash for Electrum protocol
      const scripthash = this.scriptPubKeyToScripthash(scriptPubKey);

      // Create request
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "blockchain.scripthash.get_balance",
        params: [scripthash],
      };

      // Send request to Electrum server
      const response = await this.sendElectrumRequest(request);

      if (response.error) {
        throw new Error(
          `Electrum server error: ${JSON.stringify(response.error)}`,
        );
      }

      // Convert satoshis to BTC
      const confirmedSats = response.result.confirmed;
      const unconfirmedSats = response.result.unconfirmed;
      const confirmedBtc = confirmedSats / 100000000;
      const unconfirmedBtc = unconfirmedSats / 100000000;
      const totalBtc = confirmedBtc + unconfirmedBtc;

      // Get transaction history for additional info
      const historyRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "blockchain.scripthash.get_history",
        params: [scripthash],
      };

      const historyResponse = await this.sendElectrumRequest(historyRequest);

      const txCount = historyResponse.error ? 0 : historyResponse.result.length;

      return {
        address,
        confirmed: {
          btc: confirmedBtc,
          satoshis: confirmedSats,
        },
        unconfirmed: {
          btc: unconfirmedBtc,
          satoshis: unconfirmedSats,
        },
        total: {
          btc: totalBtc,
          satoshis: confirmedSats + unconfirmedSats,
        },
        transactionCount: txCount,
      };
    } catch (error) {
      console.error(
        `Error getting balance for address ${address}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Convert scriptPubKey to scripthash for Electrum protocol
   * @param {string} scriptPubKey - The script public key in hex
   * @returns {string} - The scripthash required by Electrum protocol
   */
  scriptPubKeyToScripthash(scriptPubKey) {
    const scriptBytes = Buffer.from(scriptPubKey, "hex");
    const hash = crypto.createHash("sha256").update(scriptBytes).digest();
    return Buffer.from(hash).reverse().toString("hex");
  }

  /**
   * Get scriptPubKey from bitcoin-cli validateaddress
   * @param {string} address - Bitcoin address to validate
   * @returns {Promise<string>} - The scriptPubKey
   */
  async getScriptPubKey(address) {
    const cmd =
      `bitcoin-cli -rpcuser=${this.RPC_USER} -rpcpassword=${this.RPC_PASS} validateaddress ${address}`;

    try {
      const { stdout } = await execAsync(cmd);
      const result = JSON.parse(stdout);

      if (!result.isvalid) {
        throw new Error("Invalid Bitcoin address");
      }

      return result.scriptPubKey;
    } catch (error) {
      console.error("Error getting scriptPubKey:", error.message);
      throw error;
    }
  }

  /**
   * Send request to Electrum server
   * @param {object} request - JSON-RPC request object
   * @returns {Promise<object>} - The response from Electrum server
   */
  sendElectrumRequest(request) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let data = "";

      client.connect(this.ELECTRUM_PORT, this.ELECTRUM_HOST, () => {
        // Send request with newline character at the end
        client.write(JSON.stringify(request) + "\n");
      });

      client.on("data", (chunk) => {
        data += chunk.toString();
        if (data.includes("\n")) {
          client.end();
        }
      });

      client.on("close", () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(
            new Error(`Failed to parse Electrum response: ${error.message}`),
          );
        }
      });

      client.on("error", (error) => {
        reject(new Error(`Electrum connection error: ${error.message}`));
      });
    });
  }
  /**
   * Get transaction history for an address
   * @param {string} address - Bitcoin address
   * @param {number} limit - Maximum number of transactions to return
   * @returns {Promise<array>} - Array of transaction objects
   */
  async getTransactions(address, limit = 20) {
    try {
      // Get scriptPubKey
      const scriptPubKey = await this.getScriptPubKey(address);

      // Convert to scripthash for Electrum protocol
      const scripthash = this.scriptPubKeyToScripthash(scriptPubKey);

      // Create request for transaction history
      const historyRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "blockchain.scripthash.get_history",
        params: [scripthash],
      };

      // Send request to Electrum server
      const historyResponse = await this.sendElectrumRequest(historyRequest);

      if (historyResponse.error) {
        throw new Error(
          `Electrum server error: ${JSON.stringify(historyResponse.error)}`,
        );
      }

      // Sort transactions by height (most recent first)
      const sortedTxs = historyResponse.result.sort((a, b) => {
        // Put unconfirmed transactions (height = 0) at the top
        if (a.height === 0) return -1;
        if (b.height === 0) return 1;
        return b.height - a.height;
      });

      // Limit the number of transactions if needed
      const limitedTxs = limit > 0 ? sortedTxs.slice(0, limit) : sortedTxs;

      // Fetch details for each transaction
      const txDetails = [];
      for (const tx of limitedTxs) {
        const txRequest = {
          jsonrpc: "2.0",
          id: 1,
          method: "blockchain.transaction.get",
          params: [tx.tx_hash, true], // true for verbose mode
        };

        const txResponse = await this.sendElectrumRequest(txRequest);

        if (txResponse.error) {
          console.error(
            `Error fetching tx ${tx.tx_hash}: ${
              JSON.stringify(txResponse.error)
            }`,
          );
          continue;
        }

        // Format the date
        const date = new Date(txResponse.result.time * 1000).toLocaleString();

        txDetails.push({
          txid: tx.tx_hash,
          height: tx.height,
          time: txResponse.result.time,
          date: date,
          confirmed: tx.height > 0,
          // We'll get the real amounts from the UTXO data, setting placeholder values here
          amountBtc: 0,
          amountSats: 0,
          direction: "incoming", // Default to incoming, we'll update this later
        });
      }

      return txDetails;
    } catch (error) {
      console.error(
        `Error getting transaction history for address ${address}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get unspent transaction outputs (UTXOs) for an address
   * @param {string} address - Bitcoin address
   * @returns {Promise<object>} - Object containing UTXO information and totals
   */
  async getUtxos(address) {
    try {
      // Get scriptPubKey
      const scriptPubKey = await this.getScriptPubKey(address);

      // Convert to scripthash for Electrum protocol
      const scripthash = this.scriptPubKeyToScripthash(scriptPubKey);

      // Create request for UTXOs
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "blockchain.scripthash.listunspent",
        params: [scripthash],
      };

      // Send request to Electrum server
      const response = await this.sendElectrumRequest(request);

      if (response.error) {
        throw new Error(
          `Electrum server error: ${JSON.stringify(response.error)}`,
        );
      }

      // Add additional information to each UTXO
      const utxos = response.result.map((utxo) => {
        const valueInBtc = utxo.value / 100000000;
        return {
          ...utxo,
          txid: utxo.tx_hash,
          valueInBtc,
          outputIndex: utxo.tx_pos,
          address,
        };
      });

      // Sort by value (largest first)
      utxos.sort((a, b) => b.value - a.value);

      // Calculate total value
      let totalValue = 0;
      utxos.forEach((utxo) => {
        totalValue += utxo.value;
      });

      return {
        utxos,
        totalValueSats: totalValue,
        totalValueBtc: totalValue / 100000000,
        count: utxos.length,
      };
    } catch (error) {
      console.error(
        `Error getting UTXOs for address ${address}:`,
        error.message,
      );
      throw error;
    }
  }
}

export default Address;
