// Bitcoin Address Extractor
// Functional approach to extract unique addresses from Bitcoin blocks
// Usage: node extract-addresses.js [start_block] [end_block]

import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Configuration
const RPC_CONFIG = {
  host: "127.0.0.1",
  port: 8332,
  user: "bridger",
  password: "password",
};

const DATA_DIR = "/run/media/bridger/6TB/crypto/bitcoin/addresses";

// RPC Functions
function createRPCAuth() {
  const auth = Buffer.from(`${RPC_CONFIG.user}:${RPC_CONFIG.password}`)
    .toString("base64");
  return `Basic ${auth}`;
}

function callRPC(method, params = []) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: "1.0",
      id: Date.now(),
      method: method,
      params: params,
    };

    const postData = JSON.stringify(request);
    const options = {
      hostname: RPC_CONFIG.host,
      port: RPC_CONFIG.port,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        Authorization: createRPCAuth(),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(`RPC Error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(new Error(`Parse error: ${error.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function getBlockchainInfo() {
  return callRPC("getblockchaininfo");
}

async function getBlockHash(height) {
  return callRPC("getblockhash", [height]);
}

async function getBlock(hash, verbosity = 2) {
  return callRPC("getblock", [hash, verbosity]);
}

async function getCurrentBlockHeight() {
  try {
    const info = await getBlockchainInfo();
    return info.blocks;
  } catch (error) {
    throw new Error(`Failed to get current block height: ${error.message}`);
  }
}

// File System Functions
function ensureDataDirectory() {
  if (!fs.existsSync("data")) {
    fs.mkdirSync("data");
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
}

function loadProcessedBlocks() {
  console.log("Scanning for already processed blocks...");
  const startTime = Date.now();
  const processedBlocks = new Set();

  try {
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const blockHeight = parseInt(file.replace(".json", ""));
        if (!isNaN(blockHeight)) {
          processedBlocks.add(blockHeight);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `Found ${processedBlocks.size} already processed blocks (${duration}ms)`,
    );
  } catch (error) {
    console.log(
      "No existing processed blocks found or error reading directory",
    );
  }

  return processedBlocks;
}

function saveBlockAddresses(blockHeight, addresses) {
  const filePath = path.join(DATA_DIR, `${blockHeight}.json`);
  fs.writeFileSync(filePath, JSON.stringify(addresses, null, 2));
}

// Address Extraction Functions
function base58Encode(buffer) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  let num = BigInt("0x" + buffer.toString("hex"));

  if (num === 0n) return "1";

  let result = "";
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    result = alphabet[Number(remainder)] + result;
  }

  // Add leading 1s for leading zero bytes
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0) break;
    result = "1" + result;
  }

  return result;
}

function deriveAddressFromPubkey(scriptHex) {
  try {
    // For P2PK scripts, extract the public key
    if (scriptHex.length < 68) return null;

    const pubkeyLength = parseInt(scriptHex.substr(0, 2), 16);
    if (pubkeyLength !== 33 && pubkeyLength !== 65) return null;

    const pubkey = scriptHex.substr(2, pubkeyLength * 2);
    const pubkeyBuffer = Buffer.from(pubkey, "hex");

    // Create P2PKH address from public key:
    // 1. SHA256 hash of the public key
    const sha256Hash = crypto.createHash("sha256").update(pubkeyBuffer)
      .digest();

    // 2. RIPEMD160 hash of the SHA256 hash
    const ripemd160Hash = crypto.createHash("ripemd160").update(sha256Hash)
      .digest();

    // 3. Add version byte (0x00 for mainnet P2PKH)
    const versionedHash = Buffer.concat([Buffer.from([0x00]), ripemd160Hash]);

    // 4. Double SHA256 for checksum
    const checksum = crypto.createHash("sha256").update(
      crypto.createHash("sha256").update(versionedHash).digest(),
    ).digest().slice(0, 4);

    // 5. Concatenate and encode in Base58
    const fullHash = Buffer.concat([versionedHash, checksum]);

    return base58Encode(fullHash);
  } catch (error) {
    return null;
  }
}

function extractAddressFromOutput(vout) {
  if (!vout.scriptPubKey) return null;

  // Modern format: direct address field
  if (vout.scriptPubKey.address) {
    return vout.scriptPubKey.address;
  }

  // Legacy format: addresses array
  if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.length > 0) {
    return vout.scriptPubKey.addresses[0];
  }

  // Early blocks: P2PK outputs - derive address from public key
  if (vout.scriptPubKey.type === "pubkey" && vout.scriptPubKey.hex) {
    return deriveAddressFromPubkey(vout.scriptPubKey.hex);
  }

  return null;
}

function extractAddressesFromTransaction(tx) {
  const addresses = new Set();

  for (const vout of tx.vout) {
    const address = extractAddressFromOutput(vout);
    if (address) {
      addresses.add(address);
    }
  }

  return addresses;
}

function extractAddressesFromBlock(blockData) {
  const addresses = new Set();

  for (const tx of blockData.tx) {
    const txAddresses = extractAddressesFromTransaction(tx);
    for (const address of txAddresses) {
      addresses.add(address);
    }
  }

  return Array.from(addresses).sort();
}

// Block Processing Functions
async function processBlock(blockHeight, processedBlocks) {
  try {
    // Fast check using pre-loaded set
    if (processedBlocks.has(blockHeight)) {
      return { addressCount: 0, wasSkipped: true };
    }

    console.log(`Processing block ${blockHeight}...`);

    const blockHash = await getBlockHash(blockHeight);
    const blockData = await getBlock(blockHash, 2);

    const addresses = extractAddressesFromBlock(blockData);

    saveBlockAddresses(blockHeight, addresses);

    // Add to processed set
    processedBlocks.add(blockHeight);

    console.log(
      `Block ${blockHeight}: ${addresses.length} unique addresses saved`,
    );

    return { addressCount: addresses.length, wasSkipped: false };
  } catch (error) {
    console.error(`Error processing block ${blockHeight}: ${error.message}`);
    throw error;
  }
}

function findUnprocessedBlocks(startBlock, endBlock, processedBlocks) {
  const unprocessedBlocks = [];
  for (let blockHeight = startBlock; blockHeight <= endBlock; blockHeight++) {
    if (!processedBlocks.has(blockHeight)) {
      unprocessedBlocks.push(blockHeight);
    }
  }
  return unprocessedBlocks;
}

function logProgressReport(processedCount, totalUnprocessed, startTime) {
  const elapsed = Date.now() - startTime;
  const remaining = totalUnprocessed - processedCount;
  const avgTimePerBlock = elapsed / processedCount;
  const estimatedTimeRemaining = (remaining * avgTimePerBlock) / 1000;

  console.log(
    `Progress: ${processedCount}/${totalUnprocessed} blocks processed`,
  );
  console.log(
    `Estimated time remaining: ${estimatedTimeRemaining.toFixed(1)} seconds`,
  );
}

function logFinalStats(processedCount, totalAddresses, startTime) {
  const duration = Date.now() - startTime;

  console.log(`\nCompleted!`);
  console.log(`New blocks processed: ${processedCount}`);
  console.log(`Total unique addresses found in new blocks: ${totalAddresses}`);
  console.log(`Time taken: ${(duration / 1000).toFixed(2)} seconds`);
  if (processedCount > 0) {
    console.log(
      `Average: ${(duration / processedCount).toFixed(2)}ms per block`,
    );
  }
}

async function processRange(startBlock, endBlock) {
  console.log(`Extracting addresses from blocks ${startBlock} to ${endBlock}`);

  const processedBlocks = loadProcessedBlocks();
  const unprocessedBlocks = findUnprocessedBlocks(
    startBlock,
    endBlock,
    processedBlocks,
  );

  const totalBlocks = endBlock - startBlock + 1;
  const alreadyProcessed = totalBlocks - unprocessedBlocks.length;

  console.log(`Total blocks in range: ${totalBlocks}`);
  console.log(`Already processed: ${alreadyProcessed}`);
  console.log(`Remaining to process: ${unprocessedBlocks.length}`);

  if (unprocessedBlocks.length === 0) {
    console.log("All blocks in range already processed!");
    return;
  }

  let totalAddresses = 0;
  let processedCount = 0;
  const startTime = Date.now();

  for (const blockHeight of unprocessedBlocks) {
    try {
      const result = await processBlock(blockHeight, processedBlocks);
      if (!result.wasSkipped) {
        totalAddresses += result.addressCount;
        processedCount++;

        // Progress reporting every 100 blocks
        if (processedCount % 100 === 0) {
          logProgressReport(
            processedCount,
            unprocessedBlocks.length,
            startTime,
          );
        }
      }
    } catch (error) {
      console.error(`Failed to process block ${blockHeight}, continuing...`);
    }
  }

  logFinalStats(processedCount, totalAddresses, startTime);
}

// Argument Parsing Functions
function parseArguments(args) {
  if (args.length === 0) {
    return { type: "all" };
  } else if (args.length === 1) {
    const blockArg = parseInt(args[0]);
    if (isNaN(blockArg)) {
      throw new Error("Block number must be a valid integer");
    }
    return { type: "single", block: blockArg };
  } else if (args.length === 2) {
    const startBlock = parseInt(args[0]);
    const endBlock = parseInt(args[1]);

    if (isNaN(startBlock) || isNaN(endBlock)) {
      throw new Error("Block numbers must be valid integers");
    }

    if (endBlock < startBlock) {
      throw new Error("End block must be greater than or equal to start block");
    }

    return { type: "range", startBlock, endBlock };
  } else {
    throw new Error("Too many arguments");
  }
}

function showUsage() {
  console.log("Usage: node extract-addresses.js [start_block] [end_block]");
  console.log("Examples:");
  console.log(
    "  node extract-addresses.js              # Process all blocks from 0 to current height",
  );
  console.log(
    "  node extract-addresses.js 100          # Process only block 100",
  );
  console.log(
    "  node extract-addresses.js 1 100        # Process blocks 1 to 100",
  );
}

// Main Function
async function main() {
  const args = process.argv.slice(2);

  try {
    ensureDataDirectory();

    const parsedArgs = parseArguments(args);
    let startBlock, endBlock;

    switch (parsedArgs.type) {
      case "all":
        console.log("No arguments provided. Getting current block height...");
        const currentHeight = await getCurrentBlockHeight();
        startBlock = 0;
        endBlock = currentHeight;
        console.log(`Current block height: ${currentHeight}`);
        console.log(`Will process all blocks from 0 to ${currentHeight}`);
        break;

      case "single":
        startBlock = parsedArgs.block;
        endBlock = parsedArgs.block;
        break;

      case "range":
        startBlock = parsedArgs.startBlock;
        endBlock = parsedArgs.endBlock;
        break;

      default:
        showUsage();
        process.exit(1);
    }

    await processRange(startBlock, endBlock);
  } catch (error) {
    if (error.message === "Too many arguments") {
      showUsage();
      process.exit(1);
    } else {
      console.error("Fatal error:", error.message);
      process.exit(1);
    }
  }
}

main();
