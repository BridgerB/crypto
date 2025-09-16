// Minimal Single-File Bitcoin Miner
// Educational implementation demonstrating Bitcoin mining fundamentals

// === CRYPTO UTILITIES ===
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const firstHash = await sha256(data);
  return await sha256(firstHash);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// === BITCOIN RPC CLIENT ===
interface BlockTemplate {
  version: number;
  previousblockhash: string;
  curtime: number;
  bits: string;
  target: string;
  height: number;
  transactions: Array<{
    data: string;
    txid: string;
    hash: string;
    depends: number[];
    fee: number;
    sigops: number;
    weight: number;
  }>;
}

async function getBlockTemplate(): Promise<BlockTemplate> {
  const request = {
    jsonrpc: "1.0",
    id: crypto.randomUUID(),
    method: "getblocktemplate",
    params: [{ "rules": ["segwit"] }],
  };

  const response = await fetch("http://127.0.0.1:8332", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa("bridger:password")}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const rpcResponse = await response.json();
  if (rpcResponse.error) {
    throw new Error(
      `RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`,
    );
  }

  return rpcResponse.result;
}

// === BLOCK HEADER UTILITIES ===
interface BlockHeader {
  version: number;
  previousBlockHash: string;
  merkleRoot: string;
  time: number;
  bits: string;
  nonce: number;
}

function createDummyMerkleRoot(): string {
  return "0000000000000000000000000000000000000000000000000000000000000000";
}

function createBlockHeader(
  blockTemplate: BlockTemplate,
  nonce: number,
): BlockHeader {
  return {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot: createDummyMerkleRoot(),
    time: blockTemplate.curtime,
    bits: blockTemplate.bits,
    nonce,
  };
}

function serializeBlockHeader(header: BlockHeader): Uint8Array {
  const buffer = new ArrayBuffer(80);
  const view = new DataView(buffer);

  // Version (4 bytes, little endian)
  view.setUint32(0, header.version, true);

  // Previous block hash (32 bytes, reverse byte order for Bitcoin)
  const prevHashBytes = hexToBytes(header.previousBlockHash);
  const reversedPrevHash = prevHashBytes.reverse();
  for (let i = 0; i < 32; i++) {
    view.setUint8(4 + i, reversedPrevHash[i]);
  }

  // Merkle root (32 bytes, reverse byte order for Bitcoin)
  const merkleBytes = hexToBytes(header.merkleRoot);
  const reversedMerkle = merkleBytes.reverse();
  for (let i = 0; i < 32; i++) {
    view.setUint8(36 + i, reversedMerkle[i]);
  }

  // Time (4 bytes, little endian)
  view.setUint32(68, header.time, true);

  // Bits (4 bytes, reverse byte order for Bitcoin)
  const bitsBytes = hexToBytes(header.bits);
  const reversedBits = bitsBytes.reverse();
  for (let i = 0; i < 4; i++) {
    view.setUint8(72 + i, reversedBits[i]);
  }

  // Nonce (4 bytes, little endian)
  view.setUint32(76, header.nonce, true);

  return new Uint8Array(buffer);
}

// === MINING LOGIC ===
async function mineAttempt(
  blockTemplate: BlockTemplate,
  nonce: number,
): Promise<{ hash: string; valid: boolean }> {
  const header = createBlockHeader(blockTemplate, nonce);
  const serializedHeader = serializeBlockHeader(header);
  const headerHash = await doubleSha256(serializedHeader);
  const headerHashHex = bytesToHex(headerHash);
  const valid = headerHashHex < blockTemplate.target;

  return { hash: headerHashHex, valid };
}

async function mine(blockTemplate: BlockTemplate): Promise<void> {
  console.log("\n=== STARTING BITCOIN MINING ===");
  console.log("💡 Mining will continue until a block is found...");
  console.log("💡 Press Ctrl+C to stop mining\n");

  let nonce = 0;
  while (true) {
    const result = await mineAttempt(blockTemplate, nonce);

    console.log(`Nonce ${nonce.toLocaleString()}: ${result.hash}`);

    if (result.valid) {
      console.log(`\n🎉🎉🎉 WINNING BITCOIN BLOCK FOUND! 🎉🎉🎉`);
      console.log(`💰 BLOCK REWARD: 3.125 BTC (~$359,375 USD)`);
      console.log(`🔢 Winning Nonce: ${nonce.toLocaleString()}`);
      console.log(`🏆 Block Hash: ${result.hash}`);
      console.log(`🎯 Target: ${blockTemplate.target}`);
      console.log(`📊 Total Attempts: ${(nonce + 1).toLocaleString()}`);
      console.log(`\n🚀 STOPPING MINER - BLOCK FOUND! 🚀`);
      Deno.exit(0);
    }

    nonce++;
  }
}

// === MAIN FUNCTION ===
async function main(): Promise<void> {
  try {
    console.log("Connecting to Bitcoin Core RPC...\n");

    const blockTemplate = await getBlockTemplate();

    console.log("✅ Connected to Bitcoin Core");
    console.log(`📊 Block Height: ${blockTemplate.height}`);
    console.log(`🎯 Target: ${blockTemplate.target}`);
    console.log(`📦 Transactions: ${blockTemplate.transactions.length}`);
    console.log(`🔗 Previous Hash: ${blockTemplate.previousblockhash}`);

    // Setup Ctrl+C handler
    Deno.addSignalListener("SIGINT", () => {
      console.log("\n🛑 Mining stopped by user");
      Deno.exit(0);
    });

    await mine(blockTemplate);
  } catch (error) {
    console.error("Error:", error);
    console.log("\nMake sure Bitcoin Core is running with RPC enabled.");
    console.log("Expected configuration:");
    console.log("  Host: 127.0.0.1:8332");
    console.log("  Username: bridger");
    console.log("  Password: password");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
