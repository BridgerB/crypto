// run.js - Enhanced with improved console output

/**
 * Bitcoin ETL Runner
 * This script provides a reliable way to run the Bitcoin ETL system
 * with proper path resolution, validation, and enhanced features.
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple logging function
function log(level, message, indent = 0) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}]`;
  const indentation = "  ".repeat(indent);

  switch (level) {
    case "header":
      console.log(`\n=== ${message} ===`);
      break;
    case "success":
      console.log(`${prefix} ${indentation}SUCCESS: ${message}`);
      break;
    case "error":
      console.log(`${prefix} ${indentation}ERROR: ${message}`);
      break;
    case "warning":
      console.log(`${prefix} ${indentation}WARNING: ${message}`);
      break;
    case "info":
      console.log(`${prefix} ${indentation}INFO: ${message}`);
      break;
    case "processing":
      console.log(`${prefix} ${indentation}PROCESSING: ${message}`);
      break;
    default:
      console.log(`${prefix} ${indentation}${message}`);
  }
}

// Display a simple header
function displayHeader(title, subtitle = "") {
  console.log(`\n=== ${title} ===`);
  if (subtitle) {
    console.log(subtitle);
  }
  console.log();
}

// Display help information
function showHelp() {
  displayHeader(
    "BITCOIN ETL RUNNER",
    "High-Performance Blockchain Data Extraction Tool",
  );

  console.log("USAGE:");
  console.log("  node run.js <start_height> [end_height] [options]\n");

  console.log("ARGUMENTS:");
  console.log("  start_height    Starting block height (required)");
  console.log(
    "  end_height      Ending block height (optional, defaults to start_height)\n",
  );

  console.log("OPTIONS:");
  console.log("  --verbose, -v            Enable verbose logging");
  console.log(
    `  --workers, -w <num>      Number of worker processes (default: ${
      Math.max(1, os.cpus().length - 1)
    })`,
  );
  console.log(
    "  --batch-size, -b <num>   Batch size for prefetching (default: 50)",
  );
  console.log(
    "  --dry-run                Validate configuration without processing",
  );
  console.log("  --help, -h               Show this help message\n");

  console.log("EXAMPLES:");
  console.log("  node run.js 800000                    Process single block");
  console.log(
    "  node run.js 800000 810000             Process range of blocks",
  );
  console.log("  node run.js 800000 810000 -w 16       Use 16 workers");
  console.log(
    "  node run.js 800000 810000 -b 100 -v   Batch size 100 with verbose output",
  );
  console.log(
    "  node run.js 800000 810000 --dry-run   Validate configuration only\n",
  );
}

// Enhanced argument parsing
function parseArguments() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  let startHeight, endHeight, workers, batchSize;
  let verbose = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--workers" || arg === "-w") {
      workers = parseInt(args[i + 1]);
      i++; // Skip next argument
    } else if (arg === "--batch-size" || arg === "-b") {
      batchSize = parseInt(args[i + 1]);
      i++; // Skip next argument
    } else if (startHeight === undefined && !isNaN(parseInt(arg))) {
      startHeight = parseInt(arg);
    } else if (endHeight === undefined && !isNaN(parseInt(arg))) {
      endHeight = parseInt(arg);
    }
  }

  // Set defaults
  if (!workers || isNaN(workers)) {
    workers = Math.max(1, os.cpus().length - 1);
  }

  if (!batchSize || isNaN(batchSize)) {
    batchSize = 50;
  }

  if (endHeight === undefined) {
    endHeight = startHeight;
  }

  return {
    startHeight,
    endHeight,
    workers,
    batchSize,
    verbose,
    dryRun,
    originalArgs: args,
  };
}

// Enhanced configuration validation
function validateConfiguration(config) {
  const errors = [];
  const warnings = [];

  if (
    config.startHeight === undefined ||
    config.startHeight === null ||
    isNaN(config.startHeight)
  ) {
    errors.push("Start height must be a valid number");
  }

  if (config.endHeight < config.startHeight) {
    errors.push("End height must be greater than or equal to start height");
  }

  if (config.workers < 1 || config.workers > 128) {
    errors.push("Workers must be between 1 and 128");
  }

  if (config.batchSize < 1 || config.batchSize > 1000) {
    errors.push("Batch size must be between 1 and 1000");
  }

  // Performance warnings
  const blockRange = config.endHeight - config.startHeight + 1;
  if (blockRange > 100000 && config.workers > 8) {
    warnings.push(
      "Large block range with many workers may cause database contention",
    );
  }

  if (config.startHeight > 400000 && config.workers > 6) {
    warnings.push(
      "Processing newer blocks (>400k) with many workers may be slower due to complexity",
    );
  }

  if (config.batchSize > 100 && config.workers > 4) {
    warnings.push(
      "Large batch size with many workers may consume excessive memory",
    );
  }

  return { errors, warnings };
}

// Simple configuration display
function displayConfiguration(config) {
  const totalBlocks = config.endHeight - config.startHeight + 1;

  log("header", "CONFIGURATION SUMMARY");
  log(
    "info",
    `Block Range: ${config.startHeight.toLocaleString()} to ${config.endHeight.toLocaleString()}`,
  );
  log("info", `Total Blocks: ${totalBlocks.toLocaleString()}`);
  log(
    "info",
    `Workers: ${config.workers} of ${os.cpus().length} available cores`,
  );
  log("info", `Batch Size: ${config.batchSize} blocks per prefetch`);
  log("info", `Verbose Mode: ${config.verbose ? "Enabled" : "Disabled"}`);
  log("info", `Dry Run: ${config.dryRun ? "Yes" : "No"}`);

  if (totalBlocks > 50000) {
    log(
      "warning",
      `Processing ${totalBlocks.toLocaleString()} blocks will take considerable time.`,
    );
  }
}

// Main execution
function main() {
  displayHeader(
    "BITCOIN ETL RUNNER",
    "Blockchain Data Extraction & Processing",
  );

  // Parse command line arguments
  const config = parseArguments();

  // Validate configuration
  const validation = validateConfiguration(config);
  if (validation.errors.length > 0) {
    log("header", "CONFIGURATION ERRORS");
    validation.errors.forEach((error) => {
      log("error", error);
    });
    console.log();
    showHelp();
    process.exit(1);
  }

  // Show warnings if any
  if (validation.warnings.length > 0) {
    log("header", "PERFORMANCE WARNINGS");
    validation.warnings.forEach((warning) => {
      log("warning", warning);
    });
    console.log();
  }

  // Display configuration
  displayConfiguration(config);

  // If dry run, exit here
  if (config.dryRun) {
    log("success", "Dry run completed successfully. Configuration is valid.");
    log("info", "Run without --dry-run to start processing.", 1);
    process.exit(0);
  }

  // Prepare arguments for the ETL process
  const etlArgs = [config.startHeight, config.endHeight];

  if (config.verbose) {
    etlArgs.push("--verbose");
  }

  etlArgs.push("--workers", config.workers);
  etlArgs.push("--batch-size", config.batchSize);

  log("header", "STARTING ETL PROCESS");
  log("processing", `Command: node src/index.js ${etlArgs.join(" ")}`);
  console.log();

  const indexPath = path.resolve(__dirname, "src", "index.js");

  // Run the ETL process
  const etl = spawn("node", [indexPath, ...etlArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      BTC_ETL_BASE_DIR: __dirname,
    },
  });

  // Handle process events
  etl.on("close", (code) => {
    console.log();
    if (code === 0) {
      log("success", "ETL process completed successfully!");
    } else {
      log("error", `ETL process exited with code ${code}`);
    }
    process.exit(code);
  });

  etl.on("error", (err) => {
    log("error", `Failed to start ETL process: ${err.message}`);
    process.exit(1);
  });

  // Handle signals for graceful shutdown
  process.on("SIGINT", () => {
    console.log();
    log("warning", "Received SIGINT. Forwarding to ETL process...");
    etl.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    console.log();
    log("warning", "Received SIGTERM. Forwarding to ETL process...");
    etl.kill("SIGTERM");
  });
}

// Run the main function
main();
