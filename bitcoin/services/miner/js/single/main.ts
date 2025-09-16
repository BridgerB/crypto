import { getValidatedConfig } from "./utils/config.ts";
import { createLogger } from "./utils/logger.ts";
import { getBlockTemplate } from "./rpc/client.ts";
import { mineInfinite } from "./mining/single-threaded.ts";
import {
  logBitcoinMiningData,
  runCryptoTests,
  testBlockHeaderConstruction,
  testRealBitcoinData,
} from "./utils/debug.ts";

function createSystemDependencies() {
  return {
    logger: createLogger(true),
    exit: (code: number) => Deno.exit(code),
  };
}

function setupShutdownHandlers(logger: any) {
  const shutdown = () => {
    logger.info("\n🛑 Received shutdown signal, stopping mining...");
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

    setupShutdownHandlers(logger);

    const miningConfig = {
      logEveryHash: true,
      progressReportInterval: 100000,
    };

    const miningResult = await mineInfinite(
      blockTemplate,
      miningConfig,
      dependencies
    );

    if (!miningResult.success) {
      throw new Error(`Mining failed: ${miningResult.error}`);
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
