import { BlockTemplate } from "./rpc.ts";
import { bytesToHex, doubleSha256 } from "./crypto.ts";
import {
  BlockHeader,
  createDummyMerkleRoot,
  serializeBlockHeader,
} from "./block.ts";

export interface MiningResult {
  success: boolean;
  nonce: number;
  hash: string;
  attempts: number;
}

export async function mine(
  blockTemplate: BlockTemplate,
): Promise<MiningResult> {
  // Create base block header
  const baseHeader: BlockHeader = {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot: createDummyMerkleRoot(),
    time: blockTemplate.curtime,
    bits: blockTemplate.bits,
    nonce: 0,
  };

  // Mining loop - continue until we find a block
  let nonce = 0;
  while (true) {
    // Update nonce
    baseHeader.nonce = nonce;

    // Serialize and hash
    const serializedHeader = serializeBlockHeader(baseHeader);
    const headerHash = await doubleSha256(serializedHeader);
    const headerHashHex = bytesToHex(headerHash);

    // Log every single hash attempt
    console.log(`Nonce ${nonce.toLocaleString()}: ${headerHashHex}`);

    // Check if we found a winning block
    if (headerHashHex < blockTemplate.target) {
      // WINNING BLOCK FOUND - STOP EVERYTHING
      console.log(`\n🎉🎉🎉 WINNING BITCOIN BLOCK FOUND! 🎉🎉🎉`);
      console.log(`💰 BLOCK REWARD: 3.125 BTC (~$359,375 USD)`);
      console.log(`🔢 Winning Nonce: ${nonce.toLocaleString()}`);
      console.log(`🏆 Block Hash: ${headerHashHex}`);
      console.log(`🎯 Target: ${blockTemplate.target}`);
      console.log(`📊 Total Attempts: ${(nonce + 1).toLocaleString()}`);
      console.log(`\n🚀 STOPPING MINER - BLOCK FOUND! 🚀`);

      // Exit the entire program
      Deno.exit(0);
    }

    nonce++;
  }
}
