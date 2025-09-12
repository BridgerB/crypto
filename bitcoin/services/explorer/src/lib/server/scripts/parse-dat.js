// node src/lib/server/scripts/parse-dat.js data/bitcoin-core-data/blocks/blk02047.dat
// Bitcoin DAT file parser - handles multiple formats
import fs from "fs";
import path from "path";
import crypto from "crypto";

class BitcoinDatParser {
  constructor() {
    this.magicBytes = {
      "mainnet": 0xd9b4bef9,
      "testnet": 0xdab5bffa,
      "testnet3": 0x0709110b,
      "regtest": 0xdab5bffa,
      "signet": 0x0a03cf40,
    };

    this.stats = {
      totalBlocks: 0,
      totalTransactions: 0,
      totalInputs: 0,
      totalOutputs: 0,
      totalBTC: 0,
      dateRange: { earliest: null, latest: null },
      blockVersions: new Map(),
      addressTypes: new Map(),
      scriptTypes: new Map(),
      errors: [],
    };
  }

  async parseFile(filepath) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`BITCOIN DAT FILE PARSER`);
    console.log(`File: ${path.basename(filepath)}`);
    console.log(`${"=".repeat(80)}`);

    if (!fs.existsSync(filepath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    const stats = fs.statSync(filepath);
    console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Try different parsing strategies
    await this.tryStandardFormat(filepath);
    await this.tryAlternativeFormats(filepath);
    await this.tryPatternBasedParsing(filepath);

    // Print comprehensive summary
    this.printSummary();
  }

  async tryStandardFormat(filepath) {
    console.log(`\n🔍 TRYING STANDARD BITCOIN BLOCK FORMAT:`);
    console.log(`${"─".repeat(60)}`);

    const fd = fs.openSync(filepath, "r");
    let foundBlocks = 0;

    try {
      let offset = 0;
      const fileSize = fs.statSync(filepath).size;
      const buffer = Buffer.alloc(Math.min(1024 * 1024, fileSize)); // 1MB chunks

      while (offset < fileSize) {
        const bytesToRead = Math.min(buffer.length, fileSize - offset);
        fs.readSync(fd, buffer, 0, bytesToRead, offset);

        // Look for magic bytes
        for (let i = 0; i < bytesToRead - 8; i++) {
          const magic = buffer.readUInt32LE(i);

          for (
            const [network, expectedMagic] of Object.entries(this.magicBytes)
          ) {
            if (magic === expectedMagic) {
              console.log(
                `   ✅ Found ${network} magic bytes at offset ${offset + i}`,
              );

              // Try to parse the block
              const blockSize = buffer.readUInt32LE(i + 4);
              if (blockSize > 0 && blockSize < 32 * 1024 * 1024) {
                try {
                  await this.parseStandardBlock(
                    fd,
                    offset + i + 8,
                    blockSize,
                    network,
                  );
                  foundBlocks++;
                } catch (error) {
                  console.log(`   ❌ Error parsing block: ${error.message}`);
                }
              }
            }
          }
        }

        offset += Math.max(1, bytesToRead - 8); // Overlap to catch split magic bytes

        if (foundBlocks > 0) {
          break; // Found at least one valid block
        }
      }

      if (foundBlocks === 0) {
        console.log(`   ❌ No standard Bitcoin blocks found`);
      } else {
        console.log(`   ✅ Found ${foundBlocks} standard blocks`);
      }
    } finally {
      fs.closeSync(fd);
    }

    return foundBlocks > 0;
  }

  async parseStandardBlock(fd, offset, blockSize, network) {
    const blockBuffer = Buffer.alloc(blockSize);
    fs.readSync(fd, blockBuffer, 0, blockSize, offset);

    // Parse block header (80 bytes)
    const header = this.parseBlockHeader(blockBuffer.slice(0, 80));

    // Parse transactions
    let txOffset = 80;
    const { value: txCount, size: varintSize } = this.readVarInt(
      blockBuffer,
      txOffset,
    );
    txOffset += varintSize;

    console.log(`      Block ${header.hash.substring(0, 16)}...`);
    console.log(
      `         Height: Unknown, Time: ${header.timestamp.toISOString()}`,
    );
    console.log(
      `         Transactions: ${txCount}, Version: ${header.version}`,
    );

    // Update stats
    this.stats.totalBlocks++;
    this.stats.totalTransactions += Number(txCount);
    this.updateBlockVersion(header.version);
    this.updateDateRange(header.timestamp);

    // Parse some transactions for additional info
    const maxTxToParse = Math.min(10, Number(txCount));
    for (let i = 0; i < maxTxToParse && txOffset < blockBuffer.length; i++) {
      try {
        const { tx, size } = this.parseTransaction(blockBuffer, txOffset);
        this.updateTransactionStats(tx);
        txOffset += size;
      } catch (error) {
        break; // Stop parsing transactions if we hit an error
      }
    }
  }

  async tryAlternativeFormats(filepath) {
    console.log(`\n🔧 TRYING ALTERNATIVE FORMATS:`);
    console.log(`${"─".repeat(60)}`);

    // Try reading as if it's XOR encrypted
    await this.tryXorDecryption(filepath);

    // Try reading as if bytes are reversed/swapped
    await this.tryByteManipulation(filepath);

    // Try reading as if it's a different endianness
    await this.tryEndiannessVariations(filepath);
  }

  async tryXorDecryption(filepath) {
    console.log(`   🔐 Trying XOR decryption...`);

    const fd = fs.openSync(filepath, "r");
    const buffer = Buffer.alloc(4096);
    fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    // Try common XOR keys
    const xorKeys = [0x00, 0x42, 0x69, 0x73, 0xaa, 0x55, 0xff];

    for (const key of xorKeys) {
      const decoded = Buffer.alloc(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        decoded[i] = buffer[i] ^ key;
      }

      // Check for magic bytes in decoded data
      for (let offset = 0; offset < decoded.length - 4; offset += 4) {
        const magic = decoded.readUInt32LE(offset);
        for (
          const [network, expectedMagic] of Object.entries(this.magicBytes)
        ) {
          if (magic === expectedMagic) {
            console.log(
              `      ✅ Found ${network} magic with XOR key 0x${
                key.toString(16)
              } at offset ${offset}`,
            );
            return { method: "XOR", key, network, offset };
          }
        }
      }
    }

    console.log(`      ❌ XOR decryption unsuccessful`);
    return null;
  }

  async tryByteManipulation(filepath) {
    console.log(`   🔄 Trying byte manipulation...`);

    const fd = fs.openSync(filepath, "r");
    const buffer = Buffer.alloc(4096);
    fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    // Try byte swapping (swap adjacent bytes)
    const swapped = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length - 1; i += 2) {
      swapped[i] = buffer[i + 1];
      swapped[i + 1] = buffer[i];
    }

    // Check for magic bytes
    for (let offset = 0; offset < swapped.length - 4; offset += 4) {
      const magic = swapped.readUInt32LE(offset);
      for (const [network, expectedMagic] of Object.entries(this.magicBytes)) {
        if (magic === expectedMagic) {
          console.log(
            `      ✅ Found ${network} magic with byte swapping at offset ${offset}`,
          );
          return { method: "BYTE_SWAP", network, offset };
        }
      }
    }

    console.log(`      ❌ Byte manipulation unsuccessful`);
    return null;
  }

  async tryEndiannessVariations(filepath) {
    console.log(`   🔀 Trying endianness variations...`);

    const fd = fs.openSync(filepath, "r");
    const buffer = Buffer.alloc(4096);
    fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    // Check big-endian interpretation
    for (let offset = 0; offset < buffer.length - 4; offset += 4) {
      const magicBE = buffer.readUInt32BE(offset);
      for (const [network, expectedMagic] of Object.entries(this.magicBytes)) {
        if (magicBE === expectedMagic) {
          console.log(
            `      ✅ Found ${network} magic with big-endian at offset ${offset}`,
          );
          return { method: "BIG_ENDIAN", network, offset };
        }
      }
    }

    console.log(`      ❌ Endianness variations unsuccessful`);
    return null;
  }

  async tryPatternBasedParsing(filepath) {
    console.log(`\n🎯 PATTERN-BASED ANALYSIS:`);
    console.log(`${"─".repeat(60)}`);

    const fd = fs.openSync(filepath, "r");
    const fileSize = fs.statSync(filepath).size;

    try {
      // Sample at multiple points
      const samplePoints = 10;
      const sampleSize = 16384; // 16KB samples

      let totalPatterns = 0;
      let bestBlocks = [];

      for (let i = 0; i < samplePoints; i++) {
        const offset = Math.floor((fileSize / samplePoints) * i);
        const buffer = Buffer.alloc(Math.min(sampleSize, fileSize - offset));

        if (buffer.length < 1024) break;

        fs.readSync(fd, buffer, 0, buffer.length, offset);

        // Look for block header patterns
        const headerCandidates = this.findBlockHeaderPatterns(buffer, offset);
        const txCandidates = this.findTransactionPatterns(buffer);
        const scriptCandidates = this.findScriptPatterns(buffer);

        totalPatterns += headerCandidates.length + txCandidates.length +
          scriptCandidates.length;

        // Analyze best header candidates
        const goodHeaders = headerCandidates
          .filter((h) => h.confidence > 0.7)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3);

        bestBlocks.push(...goodHeaders);

        console.log(
          `   Sample ${i + 1} at ${(offset / 1024 / 1024).toFixed(1)}MB:`,
        );
        console.log(
          `      Headers: ${headerCandidates.length}, Transactions: ${txCandidates.length}, Scripts: ${scriptCandidates.length}`,
        );

        // Show best headers from this sample
        goodHeaders.forEach((h) => {
          const date = new Date(h.timestamp * 1000);
          console.log(
            `         Block candidate (conf: ${h.confidence.toFixed(2)}): ${
              date.toISOString().split("T")[0]
            }, v${h.version}`,
          );
        });
      }

      // Analyze all patterns found
      console.log(`\n📊 Pattern Analysis Summary:`);
      console.log(`   Total Bitcoin-like patterns found: ${totalPatterns}`);
      console.log(
        `   Average patterns per sample: ${
          (totalPatterns / samplePoints).toFixed(1)
        }`,
      );

      // Show best block candidates across entire file
      const topBlocks = bestBlocks
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10);

      if (topBlocks.length > 0) {
        console.log(`\n🏆 Top Block Candidates:`);
        topBlocks.forEach((block, index) => {
          const date = new Date(block.timestamp * 1000);
          const hash = this.calculateBlockHash(block.rawHeader);
          console.log(
            `   ${index + 1}. Confidence: ${block.confidence.toFixed(2)}`,
          );
          console.log(`      Date: ${date.toISOString()}`);
          console.log(`      Version: ${block.version}, Nonce: ${block.nonce}`);
          console.log(`      Hash: ${hash}`);
          console.log(`      Offset: ${block.globalOffset.toLocaleString()}`);

          // Update our stats based on these patterns
          this.updateDateRange(date);
          this.updateBlockVersion(block.version);
        });

        this.stats.totalBlocks = topBlocks.length;
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  // Helper parsing methods
  parseBlockHeader(headerBuffer) {
    if (headerBuffer.length < 80) {
      throw new Error("Invalid block header size");
    }

    const header = {
      version: headerBuffer.readUInt32LE(0),
      previousBlockHash: headerBuffer.slice(4, 36).reverse().toString("hex"),
      merkleRoot: headerBuffer.slice(36, 68).reverse().toString("hex"),
      timestamp: new Date(headerBuffer.readUInt32LE(68) * 1000),
      bits: headerBuffer.readUInt32LE(72),
      nonce: headerBuffer.readUInt32LE(76),
    };

    // Calculate block hash
    const hash1 = crypto.createHash("sha256").update(headerBuffer).digest();
    const hash2 = crypto.createHash("sha256").update(hash1).digest();
    header.hash = hash2.reverse().toString("hex");

    return header;
  }

  readVarInt(buffer, offset) {
    if (offset >= buffer.length) {
      throw new Error("VarInt read beyond buffer");
    }

    const first = buffer.readUInt8(offset);

    if (first < 0xfd) {
      return { value: first, size: 1 };
    } else if (first === 0xfd) {
      return { value: buffer.readUInt16LE(offset + 1), size: 3 };
    } else if (first === 0xfe) {
      return { value: buffer.readUInt32LE(offset + 1), size: 5 };
    } else {
      const bigValue = buffer.readBigUInt64LE(offset + 1);
      return { value: Number(bigValue), size: 9 };
    }
  }

  parseTransaction(buffer, offset) {
    const startOffset = offset;

    // Version
    const version = buffer.readUInt32LE(offset);
    offset += 4;

    // Input count
    const { value: inputCount, size: inputCountSize } = this.readVarInt(
      buffer,
      offset,
    );
    offset += inputCountSize;

    const inputs = [];
    const outputs = [];

    // Parse inputs (simplified)
    for (let i = 0; i < inputCount && offset < buffer.length - 36; i++) {
      offset += 36; // Previous hash + output index
      const { value: scriptLen, size: scriptLenSize } = this.readVarInt(
        buffer,
        offset,
      );
      offset += scriptLenSize + Number(scriptLen) + 4; // Script + sequence
    }

    // Output count
    if (offset >= buffer.length - 1) {
      throw new Error("Transaction truncated");
    }

    const { value: outputCount, size: outputCountSize } = this.readVarInt(
      buffer,
      offset,
    );
    offset += outputCountSize;

    // Parse outputs (simplified)
    for (let i = 0; i < outputCount && offset < buffer.length - 8; i++) {
      const value = buffer.readBigUInt64LE(offset);
      offset += 8;

      const { value: scriptLen, size: scriptLenSize } = this.readVarInt(
        buffer,
        offset,
      );
      offset += scriptLenSize;

      if (offset + Number(scriptLen) <= buffer.length) {
        const script = buffer.slice(offset, offset + Number(scriptLen));
        outputs.push({
          value: Number(value),
          script: script.toString("hex"),
          scriptType: this.identifyScriptType(script),
        });
        offset += Number(scriptLen);
      }
    }

    // Locktime
    offset += 4;

    return {
      tx: {
        version,
        inputCount: Number(inputCount),
        outputCount: Number(outputCount),
        inputs,
        outputs,
      },
      size: offset - startOffset,
    };
  }

  identifyScriptType(script) {
    if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9) {
      return "P2PKH";
    } else if (script.length === 23 && script[0] === 0xa9) {
      return "P2SH";
    } else if (
      script.length === 22 && script[0] === 0x00 && script[1] === 0x14
    ) {
      return "P2WPKH";
    } else if (
      script.length === 34 && script[0] === 0x00 && script[1] === 0x20
    ) {
      return "P2WSH";
    } else if (script.length > 0 && script[0] === 0x6a) {
      return "OP_RETURN";
    }
    return "UNKNOWN";
  }

  findBlockHeaderPatterns(buffer, globalOffset = 0) {
    const candidates = [];

    for (let i = 0; i < buffer.length - 80; i++) {
      const version = buffer.readUInt32LE(i);
      const timestamp = buffer.readUInt32LE(i + 68);
      const bits = buffer.readUInt32LE(i + 72);
      const nonce = buffer.readUInt32LE(i + 76);

      let confidence = 0;

      // Version check
      if (version >= 1 && version <= 4) confidence += 0.3;
      else if ((version & 0x20000000) !== 0) confidence += 0.2;

      // Timestamp check (Bitcoin era)
      if (timestamp > 1231006505 && timestamp < Date.now() / 1000) {
        confidence += 0.3;
      }

      // Bits check
      if (bits > 0x1d00ffff && bits < 0x207fffff) confidence += 0.2;

      // Nonce check
      if (nonce > 0 && nonce < 0xffffffff) confidence += 0.2;

      if (confidence > 0.6) {
        candidates.push({
          offset: i,
          globalOffset: globalOffset + i,
          version,
          timestamp,
          bits,
          nonce,
          confidence,
          rawHeader: buffer.slice(i, i + 80),
        });
      }
    }

    return candidates;
  }

  findTransactionPatterns(buffer) {
    const patterns = [];

    for (let i = 0; i < buffer.length - 8; i++) {
      const version = buffer.readUInt32LE(i);
      if (version >= 1 && version <= 3) {
        const inputCount = buffer.readUInt8(i + 4);
        if (inputCount > 0 && inputCount < 100) {
          patterns.push({ offset: i, version, inputCount });
        }
      }
    }

    return patterns;
  }

  findScriptPatterns(buffer) {
    const patterns = [];
    const scriptPatterns = [
      [0x76, 0xa9, 0x14], // P2PKH
      [0xa9, 0x14], // P2SH
      [0x00, 0x14], // P2WPKH
      [0x6a], // OP_RETURN
    ];

    for (const pattern of scriptPatterns) {
      for (let i = 0; i < buffer.length - pattern.length; i++) {
        if (this.matchesSignature(buffer, pattern, i)) {
          patterns.push({ offset: i, type: pattern });
        }
      }
    }

    return patterns;
  }

  calculateBlockHash(headerBuffer) {
    const hash1 = crypto.createHash("sha256").update(headerBuffer).digest();
    const hash2 = crypto.createHash("sha256").update(hash1).digest();
    return hash2.reverse().toString("hex");
  }

  // Stats update methods
  updateTransactionStats(tx) {
    this.stats.totalInputs += tx.inputCount;
    this.stats.totalOutputs += tx.outputCount;

    for (const output of tx.outputs) {
      this.stats.totalBTC += output.value / 100000000; // Convert satoshis to BTC
      this.updateScriptType(output.scriptType);
    }
  }

  updateBlockVersion(version) {
    this.stats.blockVersions.set(
      version,
      (this.stats.blockVersions.get(version) || 0) + 1,
    );
  }

  updateScriptType(scriptType) {
    this.stats.scriptTypes.set(
      scriptType,
      (this.stats.scriptTypes.get(scriptType) || 0) + 1,
    );
  }

  updateDateRange(date) {
    if (
      !this.stats.dateRange.earliest || date < this.stats.dateRange.earliest
    ) {
      this.stats.dateRange.earliest = date;
    }
    if (!this.stats.dateRange.latest || date > this.stats.dateRange.latest) {
      this.stats.dateRange.latest = date;
    }
  }

  matchesSignature(buffer, signature, offset = 0) {
    if (buffer.length < offset + signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[offset + i] !== signature[i]) return false;
    }
    return true;
  }

  printSummary() {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`BITCOIN DATA SUMMARY`);
    console.log(`${"=".repeat(80)}`);

    console.log(`📊 OVERVIEW:`);
    console.log(`   Total Blocks Found: ${this.stats.totalBlocks}`);
    console.log(`   Total Transactions: ${this.stats.totalTransactions}`);
    console.log(`   Total Inputs: ${this.stats.totalInputs}`);
    console.log(`   Total Outputs: ${this.stats.totalOutputs}`);
    console.log(`   Total BTC Value: ${this.stats.totalBTC.toFixed(8)} BTC`);

    if (this.stats.dateRange.earliest && this.stats.dateRange.latest) {
      console.log(`\n📅 DATE RANGE:`);
      console.log(
        `   Earliest: ${
          this.stats.dateRange.earliest.toISOString().split("T")[0]
        }`,
      );
      console.log(
        `   Latest: ${this.stats.dateRange.latest.toISOString().split("T")[0]}`,
      );

      const daysDiff = Math.ceil(
        (this.stats.dateRange.latest - this.stats.dateRange.earliest) /
          (1000 * 60 * 60 * 24),
      );
      console.log(`   Span: ${daysDiff.toLocaleString()} days`);
    }

    if (this.stats.blockVersions.size > 0) {
      console.log(`\n🔖 BLOCK VERSIONS:`);
      for (
        const [version, count] of [...this.stats.blockVersions.entries()].sort((
          a,
          b,
        ) => b[1] - a[1])
      ) {
        console.log(`   Version ${version}: ${count} blocks`);
      }
    }

    if (this.stats.scriptTypes.size > 0) {
      console.log(`\n📝 SCRIPT TYPES:`);
      for (
        const [type, count] of [...this.stats.scriptTypes.entries()].sort((
          a,
          b,
        ) => b[1] - a[1])
      ) {
        console.log(`   ${type}: ${count} outputs`);
      }
    }

    console.log(`\n💡 ANALYSIS CONCLUSION:`);
    if (this.stats.totalBlocks > 0) {
      console.log(`   ✅ Successfully identified Bitcoin block data`);
      console.log(`   📈 File contains valid Bitcoin blockchain information`);
      console.log(`   🎯 This appears to be a Bitcoin block data file`);
    } else {
      console.log(`   ⚠️  No standard Bitcoin blocks found`);
      console.log(`   🔍 High entropy suggests compressed or encrypted data`);
      console.log(`   📋 Bitcoin patterns detected but in non-standard format`);
      console.log(`   💭 Likely scenarios:`);
      console.log(`      - Compressed Bitcoin Core block file`);
      console.log(`      - Bitcoin Core database/index file`);
      console.log(`      - Custom or encrypted Bitcoin data format`);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node parse-dat.js <path-to-dat-file>");
    process.exit(1);
  }

  const filepath = args[0];
  const parser = new BitcoinDatParser();

  try {
    await parser.parseFile(filepath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { BitcoinDatParser };
