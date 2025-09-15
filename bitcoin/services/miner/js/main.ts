import { BitcoinRPCClient, BlockTemplate } from "./rpc.ts";
import {
  bytesToHex,
  doubleSha256,
  doubleSha256FromHex,
  doubleSha256Hex,
  sha256Hex,
} from "./crypto.ts";
import {
  BlockHeader,
  createDummyMerkleRoot,
  serializeBlockHeader,
} from "./block.ts";
import { simpleMine } from "./miner.ts";

function logMiningData(blockTemplate: BlockTemplate) {
  console.log("=== BITCOIN MINING DATA ===\n");

  console.log("🎯 TARGET & DIFFICULTY:");
  console.log(`Target: ${blockTemplate.target}`);
  console.log(`Bits: ${blockTemplate.bits}`);
  console.log(`Height: ${blockTemplate.height}`);
  console.log(
    `Current Time: ${blockTemplate.curtime} (${
      new Date(blockTemplate.curtime * 1000).toISOString()
    })`,
  );
  console.log(
    `Min Time: ${blockTemplate.mintime} (${
      new Date(blockTemplate.mintime * 1000).toISOString()
    })`,
  );

  console.log("\n📦 BLOCK HEADER COMPONENTS:");
  console.log(`Version: ${blockTemplate.version}`);
  console.log(`Previous Block Hash: ${blockTemplate.previousblockhash}`);
  console.log(
    `Coinbase Value: ${blockTemplate.coinbasevalue} satoshis (${
      blockTemplate.coinbasevalue / 100000000
    } BTC)`,
  );

  console.log("\n📋 TRANSACTIONS:");
  console.log(`Total Transactions: ${blockTemplate.transactions.length}`);
  console.log(`Size Limit: ${blockTemplate.sizelimit} bytes`);
  console.log(`Weight Limit: ${blockTemplate.weightlimit}`);
  console.log(`Sigop Limit: ${blockTemplate.sigoplimit}`);

  if (blockTemplate.transactions.length > 0) {
    console.log("\nFirst few transactions:");
    blockTemplate.transactions.slice(0, 3).forEach((tx, i) => {
      console.log(`  ${i + 1}. TXID: ${tx.txid}`);
      console.log(`     Fee: ${tx.fee} satoshis`);
      console.log(`     Weight: ${tx.weight}`);
      console.log(`     Data length: ${tx.data.length} bytes`);
    });
    if (blockTemplate.transactions.length > 3) {
      console.log(
        `  ... and ${blockTemplate.transactions.length - 3} more transactions`,
      );
    }
  }

  console.log("\n⚙️ MINING REQUIREMENTS:");
  console.log(`Nonce Range: ${blockTemplate.noncerange}`);
  console.log(`Mutable Fields: ${blockTemplate.mutable.join(", ")}`);
  console.log(`Rules: ${blockTemplate.rules.join(", ")}`);

  if (blockTemplate.default_witness_commitment) {
    console.log(
      `Witness Commitment: ${blockTemplate.default_witness_commitment}`,
    );
  }

  console.log("\n🔍 WHAT A MINER NEEDS TO DO:");
  console.log("1. Create coinbase transaction with coinbasevalue");
  console.log(
    "2. Build merkle tree from all transactions (including coinbase)",
  );
  console.log("3. Construct block header:");
  console.log("   - Version, Previous Hash, Merkle Root, Time, Bits, Nonce");
  console.log("4. Double SHA-256 the 80-byte block header");
  console.log("5. Check if result is less than target");
  console.log("6. If not, increment nonce and repeat");
  console.log(
    `7. Target requires hash to start with ${
      countLeadingZeros(blockTemplate.target)
    } zeros`,
  );

  console.log("\n💡 MINING MATH:");
  const targetBig = BigInt("0x" + blockTemplate.target);
  const maxTarget = BigInt("0x" + "f".repeat(64));
  const difficulty = Number(maxTarget / targetBig);
  console.log(`Network Difficulty: ${difficulty.toLocaleString()}`);
  console.log(
    `Probability of success per hash: 1 in ${difficulty.toLocaleString()}`,
  );
  console.log(`Expected hashes needed: ${difficulty.toLocaleString()}`);
}

function countLeadingZeros(hexString: string): number {
  let count = 0;
  for (const char of hexString) {
    if (char === "0") count++;
    else break;
  }
  return count;
}

async function testCrypto() {
  console.log("=== CRYPTO TEST VECTORS ===\n");

  // Known test vector for SHA-256
  const testInput = "hello";
  const expectedSha256 =
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  const actualSha256 = await sha256Hex(testInput);
  const actualDoubleSha256 = await doubleSha256Hex(testInput);

  console.log(`Input: "${testInput}"`);
  console.log(`Expected SHA-256: ${expectedSha256}`);
  console.log(`Actual SHA-256:   ${actualSha256}`);
  console.log(
    `✅ SHA-256 ${actualSha256 === expectedSha256 ? "CORRECT" : "FAILED"}`,
  );

  console.log(`Double SHA-256:   ${actualDoubleSha256}`);
  console.log("✅ Double SHA-256 function working\n");
}

async function testRealBitcoinData(blockTemplate: BlockTemplate) {
  console.log("=== HASHING REAL BITCOIN DATA ===\n");

  // Hash the previous block hash (real Bitcoin data)
  const prevBlockHash = blockTemplate.previousblockhash;
  const hashedPrevBlock = await doubleSha256FromHex(prevBlockHash);

  console.log(`Previous Block Hash: ${prevBlockHash}`);
  console.log(`Double SHA-256 Result: ${hashedPrevBlock}`);
  console.log("✅ Successfully hashed real Bitcoin block data\n");

  // Also hash the target for fun
  const target = blockTemplate.target;
  const hashedTarget = await doubleSha256FromHex(target);
  console.log(`Target: ${target}`);
  console.log(`Target Double SHA-256: ${hashedTarget}`);
  console.log("✅ Can process Bitcoin hex data\n");
}

async function testBlockHeaderConstruction(blockTemplate: BlockTemplate) {
  console.log("=== BUILDING REAL BLOCK HEADER ===\n");

  // Construct a real block header from template data
  const blockHeader: BlockHeader = {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot: createDummyMerkleRoot(), // TODO: calculate real merkle root
    time: blockTemplate.curtime,
    bits: blockTemplate.bits,
    nonce: 0, // Start with nonce 0
  };

  console.log("Block Header Components:");
  console.log(`  Version: ${blockHeader.version}`);
  console.log(`  Previous Hash: ${blockHeader.previousBlockHash}`);
  console.log(`  Merkle Root: ${blockHeader.merkleRoot} (dummy)`);
  console.log(`  Time: ${blockHeader.time}`);
  console.log(`  Bits: ${blockHeader.bits}`);
  console.log(`  Nonce: ${blockHeader.nonce}`);

  // Serialize to 80-byte binary format
  const serializedHeader = serializeBlockHeader(blockHeader);
  console.log(
    `\nSerialized Header (80 bytes): ${bytesToHex(serializedHeader)}`,
  );
  console.log(`Length: ${serializedHeader.length} bytes`);

  // Hash the block header (this is what miners do!)
  const headerHash = await doubleSha256(serializedHeader);
  const headerHashHex = bytesToHex(headerHash);

  console.log(`\nBlock Header Hash: ${headerHashHex}`);
  console.log(`Target:            ${blockTemplate.target}`);

  // Check if this would be a valid block
  const isValid = headerHashHex < blockTemplate.target;
  console.log(`Valid Block: ${isValid ? "✅ YES (WINNING BLOCK!)" : "❌ NO"}`);

  if (!isValid) {
    console.log("Need to increment nonce and try again...");
  }

  console.log(
    "✅ Successfully built and hashed a real Bitcoin block header!\n",
  );
}

async function main() {
  try {
    await testCrypto();

    console.log("Connecting to Bitcoin Core RPC...\n");

    const rpc = new BitcoinRPCClient();
    const blockTemplate = await rpc.getBlockTemplate();

    await testRealBitcoinData(blockTemplate);
    await testBlockHeaderConstruction(blockTemplate);

    // Actually try mining!
    console.log("=== STARTING BITCOIN MINING ===\n");
    const result = await simpleMine(blockTemplate, 10000, 1000);

    if (result.success) {
      console.log(`\n🎉 INCREDIBLE! Found a winning block!`);
      console.log(`This would be worth ${(3.125 * 115000).toLocaleString()} USD!`);
    } else {
      console.log(`\nMining statistics:`);
      console.log(`- Attempts: ${result.attempts.toLocaleString()}`);
      console.log(`- Duration: ${result.duration.toFixed(2)} seconds`);
      console.log(`- Hash rate: ${result.hashRate.toLocaleString()} hashes/second`);
      console.log(`- Probability of success: ${(result.attempts / 584295720480429600000000 * 100).toExponential(2)}%`);
    }

    logMiningData(blockTemplate);
  } catch (error) {
    console.error("Error fetching mining data:", error);
    console.log("\nMake sure Bitcoin Core is running with RPC enabled.");
    console.log("Check your bitcoin.conf has the correct RPC settings.");
  }
}

if (import.meta.main) {
  main();
}
