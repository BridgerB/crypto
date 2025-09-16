import { hexToBytes } from "./crypto.ts";

export interface BlockHeader {
  version: number;
  previousBlockHash: string;
  merkleRoot: string;
  time: number;
  bits: string;
  nonce: number;
}

export function serializeBlockHeader(header: BlockHeader): Uint8Array {
  const buffer = new ArrayBuffer(80);
  const view = new DataView(buffer);

  // Version (4 bytes, little endian)
  view.setUint32(0, header.version, true);

  // Previous block hash (32 bytes, reverse byte order for Bitcoin)
  const prevHashBytes = hexToBytes(header.previousBlockHash);
  const reversedPrevHash = prevHashBytes.reverse();
  for (let i = 0; i < 32; i++) {
    view.setUint8(4 + i, reversedPrevHash[i]);
  }

  // Merkle root (32 bytes, reverse byte order for Bitcoin)
  const merkleBytes = hexToBytes(header.merkleRoot);
  const reversedMerkle = merkleBytes.reverse();
  for (let i = 0; i < 32; i++) {
    view.setUint8(36 + i, reversedMerkle[i]);
  }

  // Time (4 bytes, little endian)
  view.setUint32(68, header.time, true);

  // Bits (4 bytes, reverse byte order for Bitcoin)
  const bitsBytes = hexToBytes(header.bits);
  const reversedBits = bitsBytes.reverse();
  for (let i = 0; i < 4; i++) {
    view.setUint8(72 + i, reversedBits[i]);
  }

  // Nonce (4 bytes, little endian)
  view.setUint32(76, header.nonce, true);

  return new Uint8Array(buffer);
}

export function createDummyMerkleRoot(): string {
  // For now, use a dummy merkle root (all zeros)
  // In real mining, this would be calculated from transactions
  return "0000000000000000000000000000000000000000000000000000000000000000";
}
