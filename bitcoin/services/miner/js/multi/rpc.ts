export interface BitcoinRPCRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: unknown[];
}

export interface BitcoinRPCResponse<T> {
  result: T;
  error: {
    code: number;
    message: string;
  } | null;
  id: string;
}

export interface BlockTemplate {
  version: number;
  rules: string[];
  vbavailable: Record<string, number>;
  vbrequired: number;
  previousblockhash: string;
  transactions: Transaction[];
  coinbaseaux: Record<string, string>;
  coinbasevalue: number;
  longpollid: string;
  target: string;
  mintime: number;
  mutable: string[];
  noncerange: string;
  sigoplimit: number;
  sizelimit: number;
  weightlimit: number;
  curtime: number;
  bits: string;
  height: number;
  default_witness_commitment?: string;
}

export interface Transaction {
  data: string;
  txid: string;
  hash: string;
  depends: number[];
  fee: number;
  sigops: number;
  weight: number;
}

export class BitcoinRPCClient {
  private readonly baseUrl: string;
  private readonly credentials: string;

  constructor(
    host: string = "127.0.0.1",
    port: number = 8332,
    username: string = "bridger",
    password: string = "password",
  ) {
    this.baseUrl = `http://${host}:${port}`;
    this.credentials = btoa(`${username}:${password}`);
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const request: BitcoinRPCRequest = {
      jsonrpc: "1.0",
      id: crypto.randomUUID(),
      method,
      params,
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${this.credentials}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rpcResponse = await response.json() as BitcoinRPCResponse<T>;

    if (rpcResponse.error) {
      throw new Error(
        `RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`,
      );
    }

    return rpcResponse.result;
  }

  async getBlockTemplate(): Promise<BlockTemplate> {
    return await this.call<BlockTemplate>("getblocktemplate", [{
      "rules": ["segwit"],
    }]);
  }
}
