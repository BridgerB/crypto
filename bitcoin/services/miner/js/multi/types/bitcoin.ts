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

export interface BlockHeader {
  version: number;
  previousBlockHash: string;
  merkleRoot: string;
  time: number;
  bits: string;
  nonce: number;
}

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

export interface MiningResult {
  success: boolean;
  nonce: number;
  hash: string;
  attempts: number;
}
