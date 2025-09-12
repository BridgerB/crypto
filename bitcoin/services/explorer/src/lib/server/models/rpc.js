// src/lib/server/models/rpc.js
import { exec } from "child_process";
import { promisify } from "util";
import net from "net";

const execAsync = promisify(exec);

class RPC {
  constructor() {
    // Configuration
    this.BITCOIN_RPC_USER = "bridger";
    this.BITCOIN_RPC_PASS = "password";
    this.ELECTRUM_HOST = "127.0.0.1";
    this.ELECTRUM_PORT = 50001;
    this.BUFFER_SIZE = 20 * 1024 * 1024; // 20MB buffer for large blocks
  }

  /**
   * Execute a Bitcoin RPC command via bitcoin-cli
   * @param {string} command - The command to execute
   * @param {Array} params - Array of parameters for the command
   * @param {object} options - Additional options (e.g., maxBuffer)
   * @returns {Promise<object>} - The parsed JSON response
   */
  async bitcoinRPC(command, params = [], options = {}) {
    try {
      const paramsString = params.map((
        p,
      ) => (typeof p === "string" ? `"${p}"` : p)).join(" ");

      const cmd =
        `bitcoin-cli -rpcuser=${this.BITCOIN_RPC_USER} -rpcpassword=${this.BITCOIN_RPC_PASS} ${command} ${paramsString}`;

      const execOptions = {
        maxBuffer: options.maxBuffer || this.BUFFER_SIZE,
      };

      const { stdout } = await execAsync(cmd, execOptions);

      // For commands that return JSON
      try {
        return JSON.parse(stdout);
      } catch (e) {
        // For commands that return plain text (like getblockhash)
        return stdout.trim();
      }
    } catch (error) {
      console.error(`Bitcoin RPC error (${command}):`, error.message);
      throw error;
    }
  }

  /**
   * Send a request to the Electrum server
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
   * Get block hash for a block height
   * @param {number} height - Block height
   * @returns {Promise<string>} - Block hash
   */
  async getBlockHash(height) {
    return this.bitcoinRPC("getblockhash", [height]);
  }

  /**
   * Get block data
   * @param {string} blockHash - Block hash
   * @param {number} verbosity - Verbosity level (0, 1, or 2)
   * @returns {Promise<object>} - Block data
   */
  async getBlock(blockHash, verbosity = 1) {
    return this.bitcoinRPC("getblock", [blockHash, verbosity]);
  }

  /**
   * Get raw transaction data
   * @param {string} txid - Transaction ID
   * @param {boolean} verbose - Whether to get verbose transaction data
   * @param {string|null} blockHash - Block hash (optional, can help with pruned nodes)
   * @returns {Promise<object>} - Raw transaction data
   */
  async getRawTransaction(txid, verbose = true, blockHash = null) {
    const params = [txid, verbose];
    if (blockHash) params.push(blockHash);
    return this.bitcoinRPC("getrawtransaction", params);
  }

  /**
   * Validate a Bitcoin address
   * @param {string} address - Bitcoin address to validate
   * @returns {Promise<object>} - Address validation info
   */
  async validateAddress(address) {
    return this.bitcoinRPC("validateaddress", [address]);
  }
}

export default RPC;
