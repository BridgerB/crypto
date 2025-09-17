import { mineAttempt } from "./core.ts";
import { logBlockFound, type Logger } from "../utils/logger.ts";
import { LOGGING_CONSTANTS } from "../utils/constants.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import type { Result } from "../types/config.ts";

export interface SingleThreadedMiningConfig {
  logEveryHash: boolean;
  progressReportInterval: number;
}

export interface MiningDependencies {
  logger: Logger;
  exit: (code: number) => void;
}

export interface MiningProgress {
  nonce: number;
  hash: string;
  attempts: number;
  hashRate: number;
}

export type MiningProgressCallback = (progress: MiningProgress) => void;

export async function mineInfinite(
  blockTemplate: BlockTemplate,
  config: SingleThreadedMiningConfig,
  dependencies: MiningDependencies,
  onProgress?: MiningProgressCallback,
): Promise<Result<{ nonce: number; hash: string; attempts: number }>> {
  let nonce = 0;
  let attempts = 0;
  const startTime = Date.now();
  let lastProgressReport = 0;

  dependencies.logger.info("\n=== STARTING BITCOIN MINING ===");
  dependencies.logger.info("💡 Mining will continue until a block is found...");
  dependencies.logger.info("💡 Press Ctrl+C to stop mining\n");

  while (true) {
    const miningResult = await mineAttempt(blockTemplate, nonce);

    if (!miningResult.success) {
      return {
        success: false,
        error: `Mining attempt failed: ${miningResult.error}`,
      };
    }

    attempts++;

    if (config.logEveryHash) {
      dependencies.logger.info(
        `Nonce ${nonce.toLocaleString()}: ${miningResult.data.hash}`,
      );
    }

    if (miningResult.data.valid) {
      logBlockFound(
        0, // Single-threaded, so worker ID is 0
        nonce,
        miningResult.data.hash,
        attempts,
        attempts,
        dependencies.logger,
      );

      dependencies.logger.info(`🎯 Target: ${blockTemplate.target}`);
      dependencies.logger.info(
        `📊 Total Attempts: ${attempts.toLocaleString()}`,
      );
      dependencies.logger.info(
        `\n🚀 ${LOGGING_CONSTANTS.MESSAGES.STOPPING_MINER} 🚀`,
      );

      dependencies.exit(0);
      return {
        success: true,
        data: {
          nonce,
          hash: miningResult.data.hash,
          attempts,
        },
      };
    }

    if (
      onProgress &&
      attempts - lastProgressReport >= config.progressReportInterval
    ) {
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - startTime) / 1000;
      const hashRate = Math.round(attempts / elapsedSeconds);

      onProgress({
        nonce,
        hash: miningResult.data.hash,
        attempts,
        hashRate,
      });

      lastProgressReport = attempts;
    }

    nonce++;
  }
}

export async function runBenchmark(
  blockTemplate: BlockTemplate,
  targetHashes: number,
  dependencies: MiningDependencies,
  onProgress?: (current: number, total: number, hashRate: number) => void,
): Promise<Result<{ hashRate: number; duration: number }>> {
  dependencies.logger.info(
    `🚀 Bitcoin Miner Benchmark - Running ${targetHashes.toLocaleString()} hashes\n`,
  );

  const startTime = Date.now();

  for (let nonce = 0; nonce < targetHashes; nonce++) {
    const miningResult = await mineAttempt(blockTemplate, nonce);

    if (!miningResult.success) {
      return {
        success: false,
        error: `Benchmark failed: ${miningResult.error}`,
      };
    }

    if (onProgress && (nonce + 1) % 100_000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const currentRate = Math.round((nonce + 1) / elapsed);
      onProgress(nonce + 1, targetHashes, currentRate);
    }
  }

  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;
  const hashRate = Math.round(targetHashes / totalDuration);

  return {
    success: true,
    data: {
      hashRate,
      duration: totalDuration,
    },
  };
}

export function logBenchmarkResults(
  targetHashes: number,
  hashRate: number,
  duration: number,
  logger: Logger,
): void {
  logger.info("\n🎯 BENCHMARK RESULTS:");
  logger.info(`Total Hashes: ${targetHashes.toLocaleString()}`);
  logger.info(`Duration: ${duration.toFixed(2)} seconds`);
  logger.info(`Hash Rate: ${hashRate.toLocaleString()} hashes/second`);

  const networkDifficulty = 584_295_720_480_429_600_000_000;
  const expectedTimeToBlock = networkDifficulty / hashRate;
  const yearsToBlock = expectedTimeToBlock / (365.25 * 24 * 3600);

  logger.info("\n📊 MINING PROJECTIONS:");
  logger.info(
    `Expected time to find block: ${expectedTimeToBlock.toLocaleString()} seconds`,
  );
  logger.info(`That's approximately: ${yearsToBlock.toExponential(2)} years`);
  logger.info(
    `Bitcoin price would need to be: $${
      (yearsToBlock * 1000000).toExponential(2)
    } for profitability`,
  );
}
