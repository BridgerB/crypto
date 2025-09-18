import { RPC_CONSTANTS } from "../utils/constants.ts";
import type {
  BitcoinRPCRequest,
  BitcoinRPCResponse,
  BlockTemplate,
} from "../types/bitcoin.ts";
import type { Result, RPCConfig } from "../types/config.ts";

export interface EnhancedRPCConfig extends RPCConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  keepAlive: boolean;
}

export function createEnhancedRPCConfig(
  baseConfig: RPCConfig,
): EnhancedRPCConfig {
  return {
    ...baseConfig,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 10000,
    keepAlive: true,
  };
}

interface ConnectionPool {
  activeConnections: number;
  lastUsed: number;
  abortController: AbortController;
}

// Simple connection pool to manage Bitcoin Core connections
class RPCConnectionPool {
  private pools: Map<string, ConnectionPool> = new Map();
  private maxConnections = 5;

  getConnection(configKey: string): AbortController {
    let pool = this.pools.get(configKey);

    if (!pool || pool.activeConnections >= this.maxConnections) {
      // Create new connection pool entry
      pool = {
        activeConnections: 0,
        lastUsed: Date.now(),
        abortController: new AbortController(),
      };
      this.pools.set(configKey, pool);
    }

    pool.activeConnections++;
    pool.lastUsed = Date.now();

    return pool.abortController;
  }

  releaseConnection(configKey: string): void {
    const pool = this.pools.get(configKey);
    if (pool && pool.activeConnections > 0) {
      pool.activeConnections--;
    }
  }

  cleanup(): void {
    const now = Date.now();
    const maxIdleTime = 60000; // 1 minute

    for (const [key, pool] of this.pools.entries()) {
      if (pool.activeConnections === 0 && (now - pool.lastUsed) > maxIdleTime) {
        pool.abortController.abort();
        this.pools.delete(key);
      }
    }
  }
}

const connectionPool = new RPCConnectionPool();

// Cleanup idle connections every minute
setInterval(() => connectionPool.cleanup(), 60000);

export async function makeEnhancedRPCCall<T>(
  config: EnhancedRPCConfig,
  request: BitcoinRPCRequest,
): Promise<Result<T>> {
  const configKey = `${config.host}:${config.port}`;
  let lastError: string = "";

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const abortController = connectionPool.getConnection(configKey);

    try {
      // Add timeout to the request
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`RPC timeout after ${config.timeoutMs}ms`)),
          config.timeoutMs,
        );
      });

      const fetchPromise = fetch(createRPCUrl(config), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": createAuthHeader(config),
          "Connection": config.keepAlive ? "keep-alive" : "close",
          "Keep-Alive": config.keepAlive ? "timeout=30, max=100" : undefined,
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rpcResponse = await response.json() as BitcoinRPCResponse<T>;

      if (rpcResponse.error) {
        throw new Error(
          `RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`,
        );
      }

      connectionPool.releaseConnection(configKey);
      return { success: true, data: rpcResponse.result };
    } catch (error) {
      connectionPool.releaseConnection(configKey);
      lastError = error instanceof Error ? error.message : String(error);

      // Don't retry on certain errors
      if (
        lastError.includes("401") || lastError.includes("403") ||
        lastError.includes("RPC Error")
      ) {
        break;
      }

      // Retry with exponential backoff
      if (attempt < config.maxRetries) {
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        console.warn(
          `RPC call failed (attempt ${attempt + 1}/${
            config.maxRetries + 1
          }): ${lastError}`,
        );
        console.warn(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    error: `RPC call failed after ${
      config.maxRetries + 1
    } attempts: ${lastError}`,
  };
}

export function createRPCRequest(
  method: string,
  params: unknown[] = [],
): BitcoinRPCRequest {
  return {
    jsonrpc: RPC_CONSTANTS.JSON_RPC_VERSION,
    id: crypto.randomUUID(),
    method,
    params,
  };
}

export function createAuthHeader(config: RPCConfig): string {
  const credentials = btoa(`${config.username}:${config.password}`);
  return `Basic ${credentials}`;
}

export function createRPCUrl(config: RPCConfig): string {
  return `http://${config.host}:${config.port}`;
}

export async function getBlockTemplate(
  config: EnhancedRPCConfig,
): Promise<Result<BlockTemplate>> {
  const request = createRPCRequest("getblocktemplate", [{ rules: ["segwit"] }]);
  return await makeEnhancedRPCCall<BlockTemplate>(config, request);
}
