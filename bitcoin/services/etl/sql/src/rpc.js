// src/rpc.js
import http from "http";
import net from "net";

/**
 * RPC class for interacting with Bitcoin node and Electrum server
 * Optimized for high-throughput ETL with batching and persistent connections
 */
export class RPC {
  constructor(config = {}) {
    // Configuration with defaults
    this.BITCOIN_RPC_USER = config.rpcUser || "bridger";
    this.BITCOIN_RPC_PASS = config.rpcPass || "password";
    this.BITCOIN_RPC_HOST = config.rpcHost || "127.0.0.1";
    this.BITCOIN_RPC_PORT = config.rpcPort || 8332;
    this.ELECTRUM_HOST = config.electrumHost || "127.0.0.1";
    this.ELECTRUM_PORT = config.electrumPort || 50001;
    this.BUFFER_SIZE = config.bufferSize || 20 * 1024 * 1024; // 20MB buffer for large blocks

    // HTTP Agent for persistent connections
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: 64, // Match your rpcthreads setting
      maxFreeSockets: 32,
      timeout: 60000,
      keepAliveMsecs: 30000,
    });

    // Request ID counter for JSON-RPC
    this.requestId = 0;

    // Basic auth header
    const auth = Buffer.from(
      `${this.BITCOIN_RPC_USER}:${this.BITCOIN_RPC_PASS}`,
    ).toString("base64");
    this.authHeader = `Basic ${auth}`;
  }

  /**
   * Get next request ID
   */
  getNextId() {
    return ++this.requestId;
  }

  /**
   * Execute a single Bitcoin RPC command via HTTP JSON-RPC
   * @param {string} method - The RPC method name
   * @param {Array} params - Array of parameters for the method
   * @returns {Promise<any>} - The result from the RPC call
   */
  async bitcoinRPC(method, params = []) {
    const request = {
      jsonrpc: "1.0",
      id: this.getNextId(),
      method: method,
      params: params,
    };

    return this.sendSingleRequest(request);
  }

  /**
   * Execute multiple Bitcoin RPC commands in a single batch
   * @param {Array} requests - Array of {method, params} objects
   * @returns {Promise<Array>} - Array of results in the same order as requests
   */
  async bitcoinRPCBatch(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("Batch requests must be a non-empty array");
    }

    // Convert to JSON-RPC format
    const jsonRpcRequests = requests.map((req) => ({
      jsonrpc: "1.0",
      id: this.getNextId(),
      method: req.method,
      params: req.params || [],
    }));

    return this.sendBatchRequest(jsonRpcRequests);
  }

  /**
   * Send a single JSON-RPC request
   * @param {object} request - JSON-RPC request object
   * @returns {Promise<any>} - The result
   */
  sendSingleRequest(request) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(request);

      const options = {
        hostname: this.BITCOIN_RPC_HOST,
        port: this.BITCOIN_RPC_PORT,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          Authorization: this.authHeader,
        },
        agent: this.agent, // Use persistent connection
      };

      const req = http.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(`RPC Error: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse RPC response: ${error.message}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`RPC request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Send a batch of JSON-RPC requests
   * @param {Array} requests - Array of JSON-RPC request objects
   * @returns {Promise<Array>} - Array of results
   */
  sendBatchRequest(requests) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requests);

      const options = {
        hostname: this.BITCOIN_RPC_HOST,
        port: this.BITCOIN_RPC_PORT,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          Authorization: this.authHeader,
        },
        agent: this.agent, // Use persistent connection
      };

      const req = http.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const responses = JSON.parse(data);

            // Sort responses by ID to maintain order
            const sortedResponses = responses.sort((a, b) => a.id - b.id);

            // Extract results and check for errors
            const results = sortedResponses.map((response) => {
              if (response.error) {
                throw new Error(`RPC Error: ${response.error.message}`);
              }
              return response.result;
            });

            resolve(results);
          } catch (error) {
            reject(
              new Error(`Failed to parse batch RPC response: ${error.message}`),
            );
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Batch RPC request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Batch get block hashes for a range of heights
   * @param {number} startHeight - Starting block height
   * @param {number} endHeight - Ending block height (inclusive)
   * @returns {Promise<Array>} - Array of block hashes
   */
  async getBlockHashesBatch(startHeight, endHeight) {
    const requests = [];
    for (let height = startHeight; height <= endHeight; height++) {
      requests.push({ method: "getblockhash", params: [height] });
    }
    return this.bitcoinRPCBatch(requests);
  }

  /**
   * Batch get blocks by their hashes
   * @param {Array<string>} blockHashes - Array of block hashes
   * @param {number} verbosity - Verbosity level (0, 1, or 2)
   * @returns {Promise<Array>} - Array of block data
   */
  async getBlocksBatch(blockHashes, verbosity = 2) {
    const requests = blockHashes.map((hash) => ({
      method: "getblock",
      params: [hash, verbosity],
    }));
    return this.bitcoinRPCBatch(requests);
  }

  /**
   * Batch get raw transactions
   * @param {Array<string>} txids - Array of transaction IDs
   * @param {boolean} verbose - Whether to get verbose transaction data
   * @param {string|null} blockHash - Block hash (optional)
   * @returns {Promise<Array>} - Array of raw transaction data
   */
  async getRawTransactionsBatch(txids, verbose = true, blockHash = null) {
    const requests = txids.map((txid) => {
      const params = [txid, verbose];
      if (blockHash) params.push(blockHash);
      return { method: "getrawtransaction", params };
    });
    return this.bitcoinRPCBatch(requests);
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

  /**
   * Get tip block height of the blockchain
   * @returns {Promise<number>} - Current tip block height
   */
  async getBlockchainInfo() {
    return this.bitcoinRPC("getblockchaininfo");
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
   * Clean up resources
   */
  destroy() {
    if (this.agent) {
      this.agent.destroy();
    }
  }
}
