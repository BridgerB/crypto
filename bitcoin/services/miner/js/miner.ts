import { BlockTemplate } from "./rpc.ts";
import { bytesToHex, doubleSha256 } from "./crypto.ts";
import {
  BlockHeader,
  createDummyMerkleRoot,
  serializeBlockHeader,
} from "./block.ts";

export interface MiningResult {
  success: boolean;
  nonce?: number;
  hash?: string;
  attempts: number;
  duration: number;
  hashRate: number;
}

export async function simpleMine(
  blockTemplate: BlockTemplate,
  maxAttempts: number = 10000,
  progressInterval: number = 1000,
): Promise<MiningResult> {
  console.log(
    `🚀 Starting mining with ${maxAttempts.toLocaleString()} attempts...\n`,
  );

  const startTime = Date.now();

  // Create base block header
  const baseHeader: BlockHeader = {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot: createDummyMerkleRoot(),
    time: blockTemplate.curtime,
    bits: blockTemplate.bits,
    nonce: 0,
  };

  // Mining loop
  for (let nonce = 0; nonce < maxAttempts; nonce++) {
    // Update nonce
    baseHeader.nonce = nonce;

    // Serialize and hash
    const serializedHeader = serializeBlockHeader(baseHeader);
    const headerHash = await doubleSha256(serializedHeader);
    const headerHashHex = bytesToHex(headerHash);

    // Check if we found a winning block
    if (headerHashHex < blockTemplate.target) {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const hashRate = Math.round(nonce / duration);

      console.log(`🎉 WINNING BLOCK FOUND!`);
      console.log(`Nonce: ${nonce}`);
      console.log(`Hash: ${headerHashHex}`);
      console.log(`Target: ${blockTemplate.target}`);

      return {
        success: true,
        nonce,
        hash: headerHashHex,
        attempts: nonce + 1,
        duration,
        hashRate,
      };
    }

    // Show progress
    if ((nonce + 1) % progressInterval === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const currentHashRate = Math.round((nonce + 1) / elapsed);
      console.log(
        `Mining attempt ${(nonce + 1).toLocaleString()}: hash ${
          headerHashHex.substring(0, 16)
        }... (${currentHashRate} h/s)`,
      );
    }
  }

  // No winning block found
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  const hashRate = Math.round(maxAttempts / duration);

  console.log(
    `\n❌ No winning block found after ${maxAttempts.toLocaleString()} attempts`,
  );
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Hash rate: ${hashRate.toLocaleString()} hashes/second`);

  return {
    success: false,
    attempts: maxAttempts,
    duration,
    hashRate,
  };
}
