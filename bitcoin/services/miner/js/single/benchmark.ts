import { getValidatedConfig } from "./utils/config.ts";
import { createLogger } from "./utils/logger.ts";
import { getBlockTemplate } from "./rpc/client.ts";
import { logBenchmarkResults, runBenchmark } from "./mining/single-threaded.ts";

function createSystemDependencies() {
  return {
    logger: createLogger(true),
    exit: (code: number) => Deno.exit(code),
  };
}

async function benchmark(): Promise<void> {
  const configResult = getValidatedConfig();
  if (!configResult.success) {
    console.error("Configuration error:", configResult.error);
    Deno.exit(1);
  }

  const config = configResult.data;
  const dependencies = createSystemDependencies();
  const { logger } = dependencies;

  try {
    logger.info("Connecting to Bitcoin Core RPC...");

    const blockTemplateResult = await getBlockTemplate(config.rpc);
    if (!blockTemplateResult.success) {
      throw new Error(
        `Failed to get block template: ${blockTemplateResult.error}`,
      );
    }

    const blockTemplate = blockTemplateResult.data;
    logger.info("Setting up block header...");
    logger.info("Starting benchmark...\n");

    const targetHashes = 1_000_000;

    const benchmarkResult = await runBenchmark(
      blockTemplate,
      targetHashes,
      dependencies,
      (current, total, hashRate) => {
        logger.info(
          `Progress: ${current.toLocaleString()} hashes (${hashRate.toLocaleString()} h/s)`,
        );
      },
    );

    if (!benchmarkResult.success) {
      throw new Error(`Benchmark failed: ${benchmarkResult.error}`);
    }

    const { hashRate, duration } = benchmarkResult.data;
    logBenchmarkResults(targetHashes, hashRate, duration, logger);
  } catch (error) {
    logger.error(
      "Benchmark failed: " +
        (error instanceof Error ? error.message : String(error)),
    );
    logger.info("\nMake sure Bitcoin Core is running with RPC enabled.");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  benchmark();
}
