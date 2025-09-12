// Address Uniquifier
// Reads a flattened address file and creates a new file with only unique addresses
// Usage: node unique.js [input file] [output file]

import fs from "fs";
import path from "path";
import readline from "readline";
import { createReadStream, createWriteStream } from "fs";

class AddressUniquifier {
  constructor(
    inputFile = "data/flattened.txt",
    outputFile = "data/unique.txt",
  ) {
    this.inputFile = inputFile;
    this.outputFile = outputFile;
    this.tempDir = "data/temp";
    this.chunkSize = 1000000; // Process 1 million lines per chunk
  }

  // Write sorted data to file using streaming
  async writeStreamSorted(dataSet, outputFile) {
    const sortedData = Array.from(dataSet).sort();
    const writeStream = createWriteStream(outputFile);

    return new Promise((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("finish", () => resolve(sortedData.length));

      // Write in chunks to avoid memory issues
      const chunkSize = 10000;
      let written = 0;

      const writeChunk = () => {
        let canWriteMore = true;
        while (written < sortedData.length && canWriteMore) {
          const endIndex = Math.min(written + chunkSize, sortedData.length);
          const chunk = sortedData.slice(written, endIndex);
          const data = chunk.join("\n") +
            (endIndex < sortedData.length ? "\n" : "\n");

          canWriteMore = writeStream.write(data);
          written = endIndex;
        }

        if (written < sortedData.length) {
          writeStream.once("drain", writeChunk);
        } else {
          writeStream.end();
        }
      };

      writeChunk();
    });
  }

  // Process file in chunks to avoid memory issues
  async processFileInChunks() {
    console.log(`Processing file ${this.inputFile} in chunks...`);

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const fileSize = fs.statSync(this.inputFile).size;
    let bytesRead = 0;
    let chunkNumber = 0;
    let totalLines = 0;
    const chunkFiles = [];

    // First pass: Split the file into sorted chunks
    while (bytesRead < fileSize) {
      const uniqueAddresses = new Set();
      let linesInChunk = 0;
      let currentChunkSize = 0;

      console.log(`Reading chunk ${chunkNumber + 1}...`);

      const fileStream = createReadStream(this.inputFile, { start: bytesRead });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        uniqueAddresses.add(line);
        linesInChunk++;
        currentChunkSize += line.length + 1; // +1 for the newline

        if (linesInChunk >= this.chunkSize) {
          break;
        }
      }

      // Update the bytes read
      bytesRead += currentChunkSize;
      totalLines += linesInChunk;

      console.log(
        `Chunk ${
          chunkNumber + 1
        } read: ${linesInChunk} lines, ${uniqueAddresses.size} unique`,
      );

      // Write sorted chunk to a temporary file
      const chunkFile = path.join(this.tempDir, `chunk_${chunkNumber}.txt`);
      await this.writeStreamSorted(uniqueAddresses, chunkFile);
      chunkFiles.push(chunkFile);

      // Clear memory
      uniqueAddresses.clear();
      chunkNumber++;

      // Close the file stream
      rl.close();
      fileStream.destroy();
    }

    console.log(
      `First pass complete: ${totalLines} total lines, ${chunkFiles.length} chunks created`,
    );

    // Second pass: Merge the sorted chunks
    if (chunkFiles.length === 0) {
      console.log("No chunks to merge");
      return 0;
    } else if (chunkFiles.length === 1) {
      // Just rename the single chunk file
      fs.renameSync(chunkFiles[0], this.outputFile);
      console.log(`Single chunk - renamed to ${this.outputFile}`);
      return this.countLines(this.outputFile);
    } else {
      // Merge multiple chunks
      return await this.mergeChunks(chunkFiles);
    }
  }

  // Merge sorted chunks with uniqueness
  async mergeChunks(chunkFiles) {
    console.log(`Merging ${chunkFiles.length} chunks...`);

    // For small number of chunks, use in-memory merge
    if (chunkFiles.length <= 10) {
      return await this.inMemoryMerge(chunkFiles);
    }

    // For large number of chunks, use external merge sort
    return await this.externalMerge(chunkFiles);
  }

  // In-memory merge for small number of chunks
  async inMemoryMerge(chunkFiles) {
    console.log("Using in-memory merge");
    const uniqueAddresses = new Set();

    for (const chunkFile of chunkFiles) {
      const content = fs.readFileSync(chunkFile, "utf8");
      const lines = content.trim().split("\n");

      for (const line of lines) {
        uniqueAddresses.add(line);
      }

      // Delete chunk file after reading
      fs.unlinkSync(chunkFile);
    }

    // Write unique addresses to output file
    await this.writeStreamSorted(uniqueAddresses, this.outputFile);
    console.log(
      `Merged into ${this.outputFile}: ${uniqueAddresses.size} unique addresses`,
    );

    return uniqueAddresses.size;
  }

  // External merge for large number of chunks
  async externalMerge(chunkFiles) {
    console.log("Using external merge");
    const writeStream = createWriteStream(this.outputFile);

    // Create file readers for each chunk
    const readers = chunkFiles.map((file) => {
      return {
        file,
        lines: [],
        exhausted: false,
        currentLine: null,
      };
    });

    // Initialize all readers
    for (const reader of readers) {
      try {
        reader.lines = fs.readFileSync(reader.file, "utf8").trim().split("\n");
        reader.currentLine = reader.lines.shift() || null;
      } catch (error) {
        console.error(`Error reading ${reader.file}: ${error.message}`);
        reader.exhausted = true;
        reader.currentLine = null;
      }
    }

    let uniqueCount = 0;
    let lastWritten = null;

    return new Promise((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("finish", () => {
        // Clean up temp files
        for (const reader of readers) {
          try {
            fs.unlinkSync(reader.file);
          } catch (error) {
            // Ignore errors
          }
        }

        resolve(uniqueCount);
      });

      const writeNextLine = () => {
        // Find the smallest non-exhausted reader
        let smallestLine = null;
        let smallestReaders = [];

        for (const reader of readers) {
          if (reader.exhausted || reader.currentLine === null) continue;

          if (smallestLine === null || reader.currentLine < smallestLine) {
            smallestLine = reader.currentLine;
            smallestReaders = [reader];
          } else if (reader.currentLine === smallestLine) {
            smallestReaders.push(reader);
          }
        }

        if (smallestLine === null) {
          // All readers are exhausted
          writeStream.end();
          return;
        }

        // Write the smallest line if it's different from the last one written
        if (smallestLine !== lastWritten) {
          writeStream.write(smallestLine + "\n");
          uniqueCount++;
          lastWritten = smallestLine;
        }

        // Advance all readers with the smallest line
        for (const reader of smallestReaders) {
          reader.currentLine = reader.lines.shift() || null;
          if (reader.currentLine === null && reader.lines.length === 0) {
            reader.exhausted = true;
          }
        }

        // Continue with the next line
        setImmediate(writeNextLine);
      };

      writeNextLine();
    });
  }

  // Count lines in a file
  countLines(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    return content.trim().split("\n").length;
  }

  async uniquifyAddresses() {
    try {
      console.log(
        `Starting uniquification of ${this.inputFile} to ${this.outputFile}`,
      );

      if (!fs.existsSync(this.inputFile)) {
        console.error(`Input file ${this.inputFile} does not exist!`);
        process.exit(1);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(this.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Process file in chunks to avoid memory issues
      const uniqueCount = await this.processFileInChunks();

      // Clean up temp directory
      try {
        fs.rmdirSync(this.tempDir, { recursive: true });
      } catch (error) {
        console.warn(`Could not delete temp directory: ${error.message}`);
      }

      console.log(`\nCompleted!`);
      console.log(`Total unique addresses: ${uniqueCount}`);
      console.log(`Output file: ${this.outputFile}`);
    } catch (error) {
      console.error("Fatal error:", error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  let inputFile = "data/flattened.txt";
  let outputFile = "data/unique.txt";

  // Check for command line arguments
  if (process.argv.length >= 3) {
    inputFile = process.argv[2];
  }

  if (process.argv.length >= 4) {
    outputFile = process.argv[3];
  }

  console.log(
    `Starting address uniquification from ${inputFile} to ${outputFile}`,
  );

  const uniquifier = new AddressUniquifier(inputFile, outputFile);
  await uniquifier.uniquifyAddresses();
}

main();
