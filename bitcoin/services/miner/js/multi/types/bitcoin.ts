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

// Block template transaction (from Bitcoin Core getblocktemplate)
export interface Transaction {
  data: string; // Serialized transaction hex
  txid: string; // Transaction ID
  hash: string; // Transaction hash (for witness)
  depends: number[]; // Dependencies on other transactions
  fee: number; // Fee in satoshis
  sigops: number; // Signature operations count
  weight: number; // Transaction weight
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

// Enhanced Bitcoin transaction types
export interface TransactionInput {
  txid: string; // Previous transaction ID
  vout: number; // Output index
  scriptSig: string; // Unlocking script
  sequence: number; // Sequence number
}

export interface TransactionOutput {
  value: number; // Value in satoshis
  scriptPubKey: string; // Locking script
}

export interface DetailedTransaction {
  version: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  locktime: number;
  txid?: string; // Transaction ID (calculated)
  hash?: string; // Transaction hash (for witness)
  size?: number; // Transaction size in bytes
  vsize?: number; // Virtual size
  weight?: number; // Transaction weight
  fee?: number; // Transaction fee
}

// Coinbase transaction types
export interface CoinbaseInput {
  prevTxHash: string; // Always "00...00" (32 zeros)
  prevOutputIndex: number; // Always 0xFFFFFFFF
  coinbaseScript: string; // Contains block height + arbitrary data
  sequence: number; // Always 0xFFFFFFFF
}

export interface CoinbaseTransaction {
  version: number;
  inputs: [CoinbaseInput]; // Always exactly one coinbase input
  outputs: TransactionOutput[];
  locktime: number;
  blockHeight: number; // For BIP 34 compliance
}

// Bitcoin address types
export type AddressType = "P2PKH" | "P2SH" | "P2WPKH" | "P2WSH";

export interface BitcoinAddress {
  address: string;
  type: AddressType;
  scriptPubKey: string; // Hex-encoded script
  pubkeyHash?: string; // For P2PKH/P2WPKH
  scriptHash?: string; // For P2SH/P2WSH
}

// Mining configuration types
export interface MiningMode {
  type: "genesis" | "live";
  network: "mainnet" | "testnet";
}

export interface MiningConfig {
  mode: MiningMode;
  payoutAddress: string;
  templateRefreshIntervalMs: number;
  extraNonceStart: number;
  coinbaseMessage?: string;
}

// Enhanced mining result for real blocks
export interface RealMiningResult {
  success: boolean;
  nonce: number;
  hash: string;
  attempts: number;
  merkleRoot: string;
  serializedBlock?: string; // Complete block ready for network
  blockHeight: number;
  coinbaseTransaction: CoinbaseTransaction;
}

// Template update types
export interface TemplateUpdate {
  oldTemplate: BlockTemplate;
  newTemplate: BlockTemplate;
  hasSignificantChange: boolean;
  shouldRestartMining: boolean;
}
