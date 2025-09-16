import { BitcoinRPCClient } from "./rpc.ts";
import { bytesToHex, doubleSha256 } from "./crypto.ts";
import {
  BlockHeader,
  createDummyMerkleRoot,
  serializeBlockHeader,
} from "./block.ts";

async function benchmark() {
  console.log("🚀 Bitcoin Miner Benchmark - Running 1,000,000 hashes\n");

  try {
    console.log("Connecting to Bitcoin Core RPC...");
    const rpc = new BitcoinRPCClient();
    const blockTemplate = await rpc.getBlockTemplate();

    console.log("Setting up block header...");

    // Create base block header
    const baseHeader: BlockHeader = {
      version: blockTemplate.version,
      previousBlockHash: blockTemplate.previousblockhash,
      merkleRoot: createDummyMerkleRoot(),
      time: blockTemplate.curtime,
      bits: blockTemplate.bits,
      nonce: 0,
    };

    console.log("Starting benchmark...\n");
    const startTime = Date.now();
    const targetHashes = 1_000_000;

    // Benchmark loop
    for (let nonce = 0; nonce < targetHashes; nonce++) {
      // Update nonce
      baseHeader.nonce = nonce;

      // Serialize and hash (this is what we're benchmarking)
      const serializedHeader = serializeBlockHeader(baseHeader);
      const headerHash = await doubleSha256(serializedHeader);
      const headerHashHex = bytesToHex(headerHash);

      // Show progress every 100,000 hashes
      if ((nonce + 1) % 100_000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const currentRate = Math.round((nonce + 1) / elapsed);
        console.log(
          `Progress: ${
            (nonce + 1).toLocaleString()
          } hashes (${currentRate.toLocaleString()} h/s)`,
        );
      }
    }

    const endTime = Date.now();
    const totalDuration = (endTime - startTime) / 1000;
    const hashRate = Math.round(targetHashes / totalDuration);

    console.log("\n🎯 BENCHMARK RESULTS:");
    console.log(`Total Hashes: ${targetHashes.toLocaleString()}`);
    console.log(`Duration: ${totalDuration.toFixed(2)} seconds`);
    console.log(`Hash Rate: ${hashRate.toLocaleString()} hashes/second`);

    // Calculate mining statistics
    const networkDifficulty = 584_295_720_480_429_600_000_000;
    const expectedTimeToBlock = networkDifficulty / hashRate;
    const yearsToBlock = expectedTimeToBlock / (365.25 * 24 * 3600);

    console.log("\n📊 MINING PROJECTIONS:");
    console.log(
      `Expected time to find block: ${expectedTimeToBlock.toLocaleString()} seconds`,
    );
    console.log(`That's approximately: ${yearsToBlock.toExponential(2)} years`);
    console.log(
      `Bitcoin price would need to be: $${
        (yearsToBlock * 1000000).toExponential(2)
      } for profitability`,
    );
  } catch (error) {
    console.error("Benchmark failed:", error);
    console.log("\nMake sure Bitcoin Core is running with RPC enabled.");
  }
}

if (import.meta.main) {
  benchmark();
}
