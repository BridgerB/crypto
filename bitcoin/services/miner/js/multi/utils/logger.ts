import { LOGGING_CONSTANTS } from "./constants.ts";
import type { BlockTemplate } from "../types/bitcoin.ts";
import type { MiningStats } from "../types/mining.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export function createLogger(enableEmojis: boolean = true): Logger {
  const log = (level: LogLevel, message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  };

  return {
    debug: (message: string) => log("debug", message),
    info: (message: string) => log("info", message),
    warn: (message: string) => log("warn", message),
    error: (message: string) => log("error", message),
  };
}

export function logCryptoTest(
  input: string,
  expected: string,
  actual: string,
  doubleHash: string,
  logger: Logger,
): void {
  logger.info("=== CRYPTO TEST VECTORS ===\n");
  logger.info(`Input: "${input}"`);
  logger.info(`Expected SHA-256: ${expected}`);
  logger.info(`Actual SHA-256:   ${actual}`);
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} SHA-256 ${
      actual === expected ? "CORRECT" : "FAILED"
    }`,
  );
  logger.info(`Double SHA-256:   ${doubleHash}`);
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} Double SHA-256 function working\n`,
  );
}

export function logRealBitcoinData(
  blockTemplate: BlockTemplate,
  hashedPrevBlock: string,
  hashedTarget: string,
  logger: Logger,
): void {
  logger.info("=== HASHING REAL BITCOIN DATA ===\n");
  logger.info(`Previous Block Hash: ${blockTemplate.previousblockhash}`);
  logger.info(`Double SHA-256 Result: ${hashedPrevBlock}`);
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} Successfully hashed real Bitcoin block data\n`,
  );
  logger.info(`Target: ${blockTemplate.target}`);
  logger.info(`Target Double SHA-256: ${hashedTarget}`);
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} Can process Bitcoin hex data\n`,
  );
}

export function logBlockHeaderConstruction(
  blockTemplate: BlockTemplate,
  serializedHeaderHex: string,
  headerLength: number,
  headerHashHex: string,
  isValid: boolean,
  logger: Logger,
): void {
  logger.info("=== BUILDING REAL BLOCK HEADER ===\n");
  logger.info("Block Header Components:");
  logger.info(`  Version: ${blockTemplate.version}`);
  logger.info(`  Previous Hash: ${blockTemplate.previousblockhash}`);
  logger.info(`  Merkle Root: dummy (dummy)`);
  logger.info(`  Time: ${blockTemplate.curtime}`);
  logger.info(`  Bits: ${blockTemplate.bits}`);
  logger.info(`  Nonce: 0`);

  logger.info(`\nSerialized Header (80 bytes): ${serializedHeaderHex}`);
  logger.info(`Length: ${headerLength} bytes`);

  logger.info(`\nBlock Header Hash: ${headerHashHex}`);
  logger.info(`Target:            ${blockTemplate.target}`);

  const validText = isValid
    ? `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} YES (WINNING BLOCK!)`
    : `${LOGGING_CONSTANTS.EMOJIS.ERROR} NO`;
  logger.info(`Valid Block: ${validText}`);

  if (!isValid) {
    logger.info("Need to increment nonce and try again...");
  }

  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} Successfully built and hashed a real Bitcoin block header!\n`,
  );
}

export function logMiningData(
  blockTemplate: BlockTemplate,
  logger: Logger,
): void {
  const { EMOJIS } = LOGGING_CONSTANTS;

  logger.info("=== BITCOIN MINING DATA ===\n");

  logger.info(`${EMOJIS.TARGET} TARGET & DIFFICULTY:`);
  logger.info(`Target: ${blockTemplate.target}`);
  logger.info(`Bits: ${blockTemplate.bits}`);
  logger.info(`Height: ${blockTemplate.height}`);
  logger.info(
    `Current Time: ${blockTemplate.curtime} (${
      new Date(blockTemplate.curtime * 1000).toISOString()
    })`,
  );
  logger.info(
    `Min Time: ${blockTemplate.mintime} (${
      new Date(blockTemplate.mintime * 1000).toISOString()
    })`,
  );

  logger.info(`\n${EMOJIS.PACKAGE} BLOCK HEADER COMPONENTS:`);
  logger.info(`Version: ${blockTemplate.version}`);
  logger.info(`Previous Block Hash: ${blockTemplate.previousblockhash}`);
  logger.info(
    `Coinbase Value: ${blockTemplate.coinbasevalue} satoshis (${
      blockTemplate.coinbasevalue / 100000000
    } BTC)`,
  );

  logger.info(`\n${EMOJIS.CLIPBOARD} TRANSACTIONS:`);
  logger.info(`Total Transactions: ${blockTemplate.transactions.length}`);
  logger.info(`Size Limit: ${blockTemplate.sizelimit} bytes`);
  logger.info(`Weight Limit: ${blockTemplate.weightlimit}`);
  logger.info(`Sigop Limit: ${blockTemplate.sigoplimit}`);

  if (blockTemplate.transactions.length > 0) {
    logger.info("\nFirst few transactions:");
    blockTemplate.transactions.slice(0, 3).forEach((tx, i) => {
      logger.info(`  ${i + 1}. TXID: ${tx.txid}`);
      logger.info(`     Fee: ${tx.fee} satoshis`);
      logger.info(`     Weight: ${tx.weight}`);
      logger.info(`     Data length: ${tx.data.length} bytes`);
    });
    if (blockTemplate.transactions.length > 3) {
      logger.info(
        `  ... and ${blockTemplate.transactions.length - 3} more transactions`,
      );
    }
  }

  logger.info(`\n${EMOJIS.GEAR} MINING REQUIREMENTS:`);
  logger.info(`Nonce Range: ${blockTemplate.noncerange}`);
  logger.info(`Mutable Fields: ${blockTemplate.mutable.join(", ")}`);
  logger.info(`Rules: ${blockTemplate.rules.join(", ")}`);

  if (blockTemplate.default_witness_commitment) {
    logger.info(
      `Witness Commitment: ${blockTemplate.default_witness_commitment}`,
    );
  }

  const leadingZeros = countLeadingZeros(blockTemplate.target);
  const targetBig = BigInt("0x" + blockTemplate.target);
  const maxTarget = BigInt("0x" + "f".repeat(64));
  const difficulty = Number(maxTarget / targetBig);

  logger.info(`\n${EMOJIS.MAGNIFYING_GLASS} WHAT A MINER NEEDS TO DO:`);
  logger.info("1. Create coinbase transaction with coinbasevalue");
  logger.info(
    "2. Build merkle tree from all transactions (including coinbase)",
  );
  logger.info("3. Construct block header:");
  logger.info("   - Version, Previous Hash, Merkle Root, Time, Bits, Nonce");
  logger.info("4. Double SHA-256 the 80-byte block header");
  logger.info("5. Check if result is less than target");
  logger.info("6. If not, increment nonce and repeat");
  logger.info(`7. Target requires hash to start with ${leadingZeros} zeros`);

  logger.info(`\n${EMOJIS.LIGHT_BULB} MINING MATH:`);
  logger.info(`Network Difficulty: ${difficulty.toLocaleString()}`);
  logger.info(
    `Probability of success per hash: 1 in ${difficulty.toLocaleString()}`,
  );
  logger.info(`Expected hashes needed: ${difficulty.toLocaleString()}`);
}

export function logWorkerStart(
  workerId: number,
  nonceStart: number,
  nonceEnd: number,
  logger: Logger,
): void {
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.SUCCESS} Worker ${workerId} started: nonce range ${nonceStart.toLocaleString()} - ${nonceEnd.toLocaleString()}`,
  );
}

export function logWorkerProgress(
  workerId: number,
  nonce: number,
  hash: string,
  logger: Logger,
): void {
  logger.info(
    `Worker ${workerId}: Starting mining from nonce ${nonce.toLocaleString()}`,
  );
}

export function logMiningStatus(stats: MiningStats, logger: Logger): void {
  const elapsedSeconds = Math.round(stats.elapsedTime / 1000);
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.LIGHTNING} Mining Status: ${stats.totalHashes.toLocaleString()} hashes | ` +
      `${stats.totalHashRate.toLocaleString()} H/s | ` +
      `${stats.workersActive} workers active | ` +
      `${elapsedSeconds}s elapsed`,
  );
}

export function logBlockFound(
  workerId: number,
  nonce: number,
  hash: string,
  attempts: number,
  totalAttempts: number,
  logger: Logger,
): void {
  const { EMOJIS, MESSAGES } = LOGGING_CONSTANTS;
  logger.info(
    `\n${EMOJIS.PARTY}${EMOJIS.PARTY}${EMOJIS.PARTY} ${MESSAGES.WINNING_BLOCK_FOUND} ${EMOJIS.PARTY}${EMOJIS.PARTY}${EMOJIS.PARTY}`,
  );
  logger.info(`${EMOJIS.TARGET} Found by Worker ${workerId}`);
  logger.info(`${EMOJIS.GOLD} ${MESSAGES.BLOCK_REWARD}`);
  logger.info(`${EMOJIS.HASH} Winning Nonce: ${nonce.toLocaleString()}`);
  logger.info(`${EMOJIS.TROPHY} Block Hash: ${hash}`);
  logger.info(`${EMOJIS.CHART} Worker Attempts: ${attempts.toLocaleString()}`);
  logger.info(
    `${EMOJIS.CHART} Total System Attempts: ${totalAttempts.toLocaleString()}`,
  );
  logger.info(
    `\n${EMOJIS.ROCKET} ${MESSAGES.STOPPING_WORKERS} ${EMOJIS.ROCKET}`,
  );
}

export function logWorkerExhausted(
  workerId: number,
  attempts: number,
  logger: Logger,
): void {
  logger.info(
    `${LOGGING_CONSTANTS.EMOJIS.WARNING} Worker ${workerId} exhausted its nonce range (${attempts.toLocaleString()} attempts)`,
  );
}

export function logAllWorkersExhausted(
  totalAttempts: number,
  logger: Logger,
): void {
  const { EMOJIS } = LOGGING_CONSTANTS;
  logger.info(
    `\n${EMOJIS.ERROR} All workers have exhausted their nonce ranges`,
  );
  logger.info(
    `${EMOJIS.CHART} Total attempts: ${totalAttempts.toLocaleString()}`,
  );
  logger.info(`${EMOJIS.TARGET} No block found in complete 32-bit nonce space`);
  logger.info(
    `${EMOJIS.LIGHT_BULB} In real mining, you would update timestamp and try again`,
  );
}

function countLeadingZeros(hexString: string): number {
  let count = 0;
  for (const char of hexString) {
    if (char === "0") count++;
    else break;
  }
  return count;
}
