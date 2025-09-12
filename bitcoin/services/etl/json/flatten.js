// Flattener for Bitcoin Address Files
// Reads all JSON files from data/addresses/ and creates a flat text file
// Usage: node flatten.js [input_dir] [output_file]

import fs from "fs";
import path from "path";
import { createWriteStream } from "fs";

class AddressFlattener {
  constructor(
    addressDir = "data/addresses",
    outputFile = "data/flattened.txt",
  ) {
    this.addressDir = addressDir;
    this.outputFile = outputFile;
    this.tempDir = "data/temp";
    this.batchSize = 5000; // Process files in batches - reduced for memory efficiency
  }

  // Get all JSON files sorted by block number
  getJsonFiles() {
    const files = fs
      .readdirSync(this.addressDir)
      .filter((file) => file.endsWith(".json"))
      .sort((a, b) => {
        // Sort numerically by block number
        const aNum = parseInt(path.basename(a, ".json"));
        const bNum = parseInt(path.basename(b, ".json"));
        return aNum - bNum;
      });

    return files;
  }

  // Process files in batches to avoid memory issues
  async processBatch(files, startIndex, endIndex, batchNumber) {
    console.log(
      `Processing batch ${batchNumber}: files ${startIndex} to ${endIndex - 1}`,
    );

    const outputFile = path.join(this.tempDir, `batch_${batchNumber}.txt`);
    const writeStream = createWriteStream(outputFile);
    let addressCount = 0;
    let fileCount = 0;

    return new Promise((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on(
        "finish",
        () => resolve({ file: outputFile, count: addressCount, fileCount }),
      );

      const processNextFile = (index) => {
        if (index >= endIndex || index >= files.length) {
          writeStream.end();
          return;
        }

        const file = files[index];
        const filePath = path.join(this.addressDir, file);
        const blockNumber = path.basename(file, ".json");

        try {
          const fileContent = fs.readFileSync(filePath, "utf8");
          const addresses = JSON.parse(fileContent);
          fileCount++;

          if (Array.isArray(addresses)) {
            for (const address of addresses) {
              if (typeof address === "string") {
                writeStream.write(address + "\n");
                addressCount++;
              }
            }
          }

          // Progress indicator
          if (index % 1000 === 0) {
            console.log(
              `  Block ${blockNumber}: ${addressCount} total addresses`,
            );
          }
        } catch (error) {
          console.error(`Error reading block ${blockNumber}: ${error.message}`);
        }

        // Process next file (non-blocking)
        setImmediate(() => processNextFile(index + 1));
      };

      processNextFile(startIndex);
    });
  }

  // Merge all batch files into one
  async mergeBatchFiles(batchResults) {
    console.log(`Merging ${batchResults.length} batch files...`);

    const writeStream = createWriteStream(this.outputFile);

    return new Promise((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("finish", () => {
        let totalAddresses = batchResults.reduce(
          (total, batch) => total + batch.count,
          0,
        );
        resolve(totalAddresses);
      });

      const mergeNextBatch = async (index) => {
        if (index >= batchResults.length) {
          writeStream.end();
          return;
        }

        const batchFile = batchResults[index].file;
        console.log(
          `  Merging batch file ${index + 1}/${batchResults.length} (${
            batchResults[index].count
          } addresses)`,
        );

        const readStream = fs.createReadStream(batchFile);

        readStream.on("error", (error) => {
          console.error(`Error reading batch file: ${error.message}`);
          mergeNextBatch(index + 1);
        });

        readStream.on("end", () => {
          // Delete batch file after merging
          try {
            fs.unlinkSync(batchFile);
          } catch (error) {
            console.warn(
              `Could not delete batch file ${batchFile}: ${error.message}`,
            );
          }

          mergeNextBatch(index + 1);
        });

        // Pipe the read stream to the write stream
        readStream.pipe(writeStream, { end: false });
      };

      mergeNextBatch(0);
    });
  }

  async flattenAddresses() {
    try {
      // Check if addresses directory exists
      if (!fs.existsSync(this.addressDir)) {
        console.error(`Directory ${this.addressDir} does not exist!`);
        process.exit(1);
      }

      console.log(`Reading JSON files from ${this.addressDir}...`);

      // Get all JSON files
      const files = this.getJsonFiles();

      if (files.length === 0) {
        console.error(`No JSON files found in ${this.addressDir}`);
        process.exit(1);
      }

      console.log(`Found ${files.length} JSON files to process`);

      // Ensure directories exist
      const outputDir = path.dirname(this.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }

      // Clean up old temp files
      if (fs.existsSync(this.tempDir)) {
        const tempFiles = fs.readdirSync(this.tempDir);
        for (const file of tempFiles) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
      }

      // Process files in batches
      const batchResults = [];
      let batchNumber = 0;

      for (let i = 0; i < files.length; i += this.batchSize) {
        const endIndex = Math.min(i + this.batchSize, files.length);
        const result = await this.processBatch(files, i, endIndex, batchNumber);
        batchResults.push(result);
        batchNumber++;
      }

      console.log(
        `\nProcessed ${files.length} files in ${batchResults.length} batches`,
      );

      // Merge all batch files into one
      const totalAddresses = await this.mergeBatchFiles(batchResults);

      // Clean up temp directory
      try {
        fs.rmdirSync(this.tempDir);
      } catch (error) {
        console.warn(`Could not delete temp directory: ${error.message}`);
      }

      console.log(`\nCompleted!`);
      console.log(`Total addresses: ${totalAddresses}`);
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
  // Get command line arguments
  const args = process.argv.slice(2);
  let inputDir = "data/addresses";
  let outputFile = "data/flattened.txt";

  if (args.length >= 1) {
    inputDir = args[0];
  }

  if (args.length >= 2) {
    outputFile = args[1];
  }

  console.log(`Starting address flattening process...`);
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output file: ${outputFile}`);

  const flattener = new AddressFlattener(inputDir, outputFile);
  await flattener.flattenAddresses();
}

main();
