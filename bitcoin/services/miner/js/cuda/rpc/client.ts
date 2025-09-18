import { RPC_CONSTANTS } from "../utils/constants.ts";
import type {
  BitcoinRPCRequest,
  BitcoinRPCResponse,
  BlockTemplate,
} from "../types/bitcoin.ts";
import type { Result, RPCConfig } from "../types/config.ts";

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

export async function makeRPCCall<T>(
  config: RPCConfig,
  request: BitcoinRPCRequest,
): Promise<Result<T>> {
  try {
    const response = await fetch(createRPCUrl(config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": createAuthHeader(config),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const rpcResponse = await response.json() as BitcoinRPCResponse<T>;

    if (rpcResponse.error) {
      return {
        success: false,
        error:
          `RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`,
      };
    }

    return { success: true, data: rpcResponse.result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function callRPCMethod<T>(
  config: RPCConfig,
  method: string,
  params: unknown[] = [],
): Promise<Result<T>> {
  const request = createRPCRequest(method, params);
  return await makeRPCCall<T>(config, request);
}

export async function getBlockTemplate(
  config: RPCConfig,
): Promise<Result<BlockTemplate>> {
  return await callRPCMethod<BlockTemplate>(config, "getblocktemplate", [{
    "rules": ["segwit"],
  }]);
}

export async function testRPCConnection(
  config: RPCConfig,
): Promise<Result<boolean>> {
  const result = await callRPCMethod<number>(config, "getblockcount");
  if (result.success) {
    return { success: true, data: true };
  }
  return result;
}
