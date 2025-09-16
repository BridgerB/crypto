import { bytesToHex, doubleSha256 } from "./crypto.ts";
import {
  BlockHeader,
  createDummyMerkleRoot,
  serializeBlockHeader,
} from "./block.ts";
import {
  WorkerErrorMessage,
  WorkerExhaustedMessage,
  WorkerFoundMessage,
  WorkerMessage,
  WorkerProgressMessage,
} from "./shared-types.ts";

let isRunning = false;
let workerId = 0;
let progressReportInterval = 50000; // Report every 50K hashes by default

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    if (message.type === "start") {
      workerId = message.workerId;
      isRunning = true;

      console.log(
        `Worker ${workerId}: Starting mining from nonce ${message.nonceStart.toLocaleString()} to ${message.nonceEnd.toLocaleString()}`,
      );

      await mineRange(
        message.blockTemplate,
        message.nonceStart,
        message.nonceEnd,
      );
    } else if (message.type === "stop") {
      console.log(`Worker ${workerId}: Received stop signal`);
      isRunning = false;
      self.close();
    }
  } catch (error) {
    const errorMessage: WorkerErrorMessage = {
      type: "error",
      workerId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(errorMessage);
  }
};

async function mineRange(
  blockTemplate: any,
  nonceStart: number,
  nonceEnd: number,
) {
  // Create base block header
  const baseHeader: BlockHeader = {
    version: blockTemplate.version,
    previousBlockHash: blockTemplate.previousblockhash,
    merkleRoot: createDummyMerkleRoot(),
    time: blockTemplate.curtime,
    bits: blockTemplate.bits,
    nonce: 0,
  };

  let attempts = 0;
  const startTime = Date.now();
  let lastProgressReport = 0;

  // Mining loop for this worker's nonce range
  for (let nonce = nonceStart; nonce <= nonceEnd && isRunning; nonce++) {
    // Update nonce
    baseHeader.nonce = nonce;

    // Serialize and hash
    const serializedHeader = serializeBlockHeader(baseHeader);
    const headerHash = await doubleSha256(serializedHeader);
    const headerHashHex = bytesToHex(headerHash);

    attempts++;

    // Check if we found a winning block
    if (headerHashHex < blockTemplate.target) {
      // WINNING BLOCK FOUND!
      const foundMessage: WorkerFoundMessage = {
        type: "found",
        workerId,
        nonce,
        hash: headerHashHex,
        attempts,
        totalAttempts: attempts,
      };

      console.log(
        `Worker ${workerId}: 🎉 FOUND WINNING BLOCK! Nonce: ${nonce.toLocaleString()}, Hash: ${headerHashHex}`,
      );
      self.postMessage(foundMessage);
      return; // Stop this worker
    }

    // Report progress periodically
    if (attempts - lastProgressReport >= progressReportInterval) {
      const currentTime = Date.now();
      const elapsedSeconds = (currentTime - startTime) / 1000;
      const hashRate = Math.round(attempts / elapsedSeconds);

      const progressMessage: WorkerProgressMessage = {
        type: "progress",
        workerId,
        currentNonce: nonce,
        hash: headerHashHex,
        attempts,
        hashRate,
      };

      self.postMessage(progressMessage);
      lastProgressReport = attempts;
    }
  }

  // If we reach here, we've exhausted our nonce range
  if (isRunning) {
    const exhaustedMessage: WorkerExhaustedMessage = {
      type: "exhausted",
      workerId,
      attempts,
    };

    console.log(
      `Worker ${workerId}: Exhausted nonce range (${nonceStart.toLocaleString()} to ${nonceEnd.toLocaleString()})`,
    );
    self.postMessage(exhaustedMessage);
  }
}
