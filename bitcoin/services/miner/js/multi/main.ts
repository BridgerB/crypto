import { BitcoinRPCClient } from "./rpc.ts";
import { WorkerPoolManager } from "./pool-manager.ts";
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

    // Create worker pool manager
    const poolManager = new WorkerPoolManager({
      workerCount: 12, // Use all available CPU cores
      progressReportInterval: 50000, // Report every 50K hashes per worker
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log("\n🛑 Received shutdown signal, stopping all workers...");
      poolManager.stopAllWorkers();
      Deno.exit(0);
    };

    // Listen for Ctrl+C
    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);

    // Start multi-threaded mining
    await poolManager.startMining(blockTemplate);
  } catch (error) {
    console.error("Error:", error);
    console.log("\nMake sure Bitcoin Core is running with RPC enabled.");
    console.log("Check your bitcoin.conf has the correct RPC settings.");
  }
}

if (import.meta.main) {
  main();
}
