import { getValidatedConfig } from "./utils/config.ts";
import { createLogger } from "./utils/logger.ts";
import { getBlockTemplate } from "./rpc/client.ts";
import { createWorkerPool } from "./mining/worker-pool.ts";
import {
  logBitcoinMiningData,
  runCryptoTests,
  testBlockHeaderConstruction,
  testRealBitcoinData,
} from "./utils/debug.ts";

function createSystemDependencies() {
  return {
    logger: createLogger(true),
    createWorker: (scriptURL: string) =>
      new Worker(scriptURL, { type: "module" }),
    setInterval: (callback: () => void, ms: number) =>
      setInterval(callback, ms),
    clearInterval: (intervalId: number) => clearInterval(intervalId),
    exit: (code: number) => Deno.exit(code),
  };
}

function setupShutdownHandlers(stopAllWorkers: () => void, logger: any) {
  const shutdown = () => {
    logger.info("\n🛑 Received shutdown signal, stopping all workers...");
    stopAllWorkers();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
}

async function runDebugTests(blockTemplate: any, logger: any): Promise<void> {
  const cryptoTestResult = await runCryptoTests(logger);
  if (!cryptoTestResult.success) {
    throw new Error(`Crypto tests failed: ${cryptoTestResult.error}`);
  }

  const bitcoinDataTestResult = await testRealBitcoinData(
    blockTemplate,
    logger,
  );
  if (!bitcoinDataTestResult.success) {
    throw new Error(`Bitcoin data test failed: ${bitcoinDataTestResult.error}`);
  }

  const blockHeaderTestResult = await testBlockHeaderConstruction(
    blockTemplate,
    logger,
  );
  if (!blockHeaderTestResult.success) {
    throw new Error(`Block header test failed: ${blockHeaderTestResult.error}`);
  }

  logBitcoinMiningData(blockTemplate, logger);
}

async function main(): Promise<void> {
  const configResult = getValidatedConfig();
  if (!configResult.success) {
    console.error("Configuration error:", configResult.error);
    Deno.exit(1);
  }

  const config = configResult.data;
  const dependencies = createSystemDependencies();
  const { logger } = dependencies;

  try {
    logger.info("Connecting to Bitcoin Core RPC...\n");

    const blockTemplateResult = await getBlockTemplate(config.rpc);
    if (!blockTemplateResult.success) {
      throw new Error(
        `Failed to get block template: ${blockTemplateResult.error}`,
      );
    }

    const blockTemplate = blockTemplateResult.data;

    await runDebugTests(blockTemplate, logger);

    const workerPool = createWorkerPool(config.mining, dependencies);

    setupShutdownHandlers(workerPool.stopAllWorkers, logger);

    const miningResult = await workerPool.startMining(blockTemplate);
    if (!miningResult.success) {
      throw new Error(`Failed to start mining: ${miningResult.error}`);
    }
  } catch (error) {
    logger.error(
      "Error: " + (error instanceof Error ? error.message : String(error)),
    );
    logger.info("\nMake sure Bitcoin Core is running with RPC enabled.");
    logger.info("Check your bitcoin.conf has the correct RPC settings.");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
