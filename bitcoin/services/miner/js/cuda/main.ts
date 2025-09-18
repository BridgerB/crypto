import { getValidatedConfig } from "./utils/config.ts";
import { createLogger } from "./utils/logger.ts";
import { createWorkerPool } from "./mining/worker-pool.ts";
import { createTemplateManager } from "./mining/template-manager.ts";
import {
  logBitcoinMiningData,
  runCryptoTests,
  testBlockHeaderConstruction,
  testRealBitcoinData,
} from "./utils/debug.ts";
import type { MiningMode } from "./types/bitcoin.ts";

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

function getMiningMode(): MiningMode {
  const mode = Deno.env.get("MINING_MODE") || "genesis";
  const network = Deno.env.get("BITCOIN_NETWORK") || "testnet";

  return {
    type: mode as "genesis" | "live",
    network: network as "mainnet" | "testnet",
  };
}

function setupShutdownHandlers(cleanup: () => void, logger: any) {
  const shutdown = () => {
    logger.info("\n🛑 Received shutdown signal...");
    cleanup();
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
  const miningMode = getMiningMode();

  try {
    logger.info(`🚀 Starting Real Bitcoin Miner`);
    logger.info(`Mode: ${miningMode.type.toUpperCase()}`);
    logger.info(`Network: ${miningMode.network.toUpperCase()}\n`);

    if (miningMode.type === "genesis") {
      logger.info("🧪 Genesis Block Testing Mode");
      logger.info("Target: Find nonce 2083236893 for genesis block");
      logger.info(
        "Expected hash: 000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f\n",
      );
    } else {
      logger.info("⚡ Live Mining Mode");
      logger.info(`Bitcoin Core: ${config.rpc.host}:${config.rpc.port}`);
      logger.info("Template refresh: Every 30 seconds\n");
    }

    // Create template manager
    const templateManager = createTemplateManager({
      mode: miningMode,
      rpcConfig: config.rpc,
      pollingIntervalMs: 30000, // 30 seconds
      logger,
    });

    // Create worker pool
    const workerPool = createWorkerPool(config.mining, dependencies);

    // Setup shutdown handlers
    const cleanup = () => {
      logger.info("\n🛑 Shutting down...");
      templateManager.stop();
      workerPool.stopAllWorkers();
    };
    setupShutdownHandlers(cleanup, logger);

    // Handle template updates
    templateManager.onNewTemplate((update) => {
      if (update.shouldRestartMining) {
        logger.info(
          `🔄 Template update: Block ${update.newTemplate.height} ` +
            `(${update.newTemplate.transactions.length} txs)`,
        );
        workerPool.updateBlockTemplate(update.newTemplate, true);
      }
    });

    // Start template manager
    const templateResult = await templateManager.start();
    if (!templateResult.success) {
      throw new Error(`Template manager failed: ${templateResult.error}`);
    }

    // Get initial template
    const initialTemplate = templateManager.getCurrentTemplate();
    if (!initialTemplate) {
      throw new Error("No initial template available");
    }

    // Run debug tests for genesis mode
    if (miningMode.type === "genesis") {
      await runDebugTests(initialTemplate, logger);
    }

    // Start mining
    logger.info(
      `\n=== STARTING REAL BITCOIN MINING ===\n` +
        `Workers: ${config.mining.workerCount}\n` +
        `Block Height: ${initialTemplate.height}\n` +
        `Transactions: ${initialTemplate.transactions.length}\n` +
        `Target: ${initialTemplate.target}\n` +
        `Coinbase Value: ${
          (initialTemplate.coinbasevalue / 100000000).toFixed(8)
        } BTC\n`,
    );

    const miningResult = await workerPool.startMining(initialTemplate);
    if (!miningResult.success) {
      throw new Error(`Failed to start mining: ${miningResult.error}`);
    }

    // Keep the process running
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Log periodic stats
      const templateStats = templateManager.getStats();
      if (templateStats.templatesReceived > 0) {
        logger.info(
          `📊 Stats: ${templateStats.templatesReceived} templates, ` +
            `${templateStats.significantUpdates} updates, ` +
            `${Math.round(templateStats.uptime / 1000)}s uptime`,
        );
      }
    }
  } catch (error) {
    logger.error(
      "Error: " + (error instanceof Error ? error.message : String(error)),
    );

    if (miningMode.type === "live") {
      logger.info("\nMake sure Bitcoin Core is running with RPC enabled.");
      logger.info("Check your bitcoin.conf has the correct RPC settings.");
    }

    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
