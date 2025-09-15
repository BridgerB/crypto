import { BitcoinRPCClient } from "./rpc.ts";
import { mine } from "./miner.ts";
import {
  logMiningData,
  testBlockHeaderConstruction,
  testCrypto,
  testRealBitcoinData,
} from "./debug.ts";

async function main() {
  try {
    // Run debug functions first
    await testCrypto();

    console.log("Connecting to Bitcoin Core RPC...\n");

    const rpc = new BitcoinRPCClient();
    const blockTemplate = await rpc.getBlockTemplate();

    await testRealBitcoinData(blockTemplate);
    await testBlockHeaderConstruction(blockTemplate);
    logMiningData(blockTemplate);

    // Start pure mining - this will run until success or stopped
    console.log("\n=== STARTING BITCOIN MINING ===");
    console.log("💡 Mining will continue until a block is found...");
    console.log("💡 Press Ctrl+C to stop mining\n");

    // This function runs forever until it finds a block (then exits)
    await mine(blockTemplate);
  } catch (error) {
    console.error("Error:", error);
    console.log("\nMake sure Bitcoin Core is running with RPC enabled.");
    console.log("Check your bitcoin.conf has the correct RPC settings.");
  }
}

if (import.meta.main) {
  main();
}
