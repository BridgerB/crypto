import { BitcoinRPCClient, BlockTemplate } from "./rpc.ts";

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

async function main() {
  try {
    console.log("Connecting to Bitcoin Core RPC...\n");

    const rpc = new BitcoinRPCClient();
    const blockTemplate = await rpc.getBlockTemplate();

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
