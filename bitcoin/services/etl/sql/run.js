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

// Enhanced color codes and symbols for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

const symbols = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  rocket: "🚀",
  gear: "⚙",
  clock: "⏰",
  cpu: "💻",
  memory: "💾",
  database: "🗄",
  bitcoin: "₿",
  block: "▓",
  bullet: "•",
  arrow: "→",
  check: "✓",
  cross: "✗",
};

// Helper function to colorize output with enhanced styling
function colorize(text, color, style = "") {
  const colorCode = colors[color] || "";
  const styleCode = style ? colors[style] : "";
  return `${styleCode}${colorCode}${text}${colors.reset}`;
}

// Enhanced logging function
function log(level, message, indent = 0) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `${colors.gray}[${timestamp}]${colors.reset}`;
  const indentation = "  ".repeat(indent);

  switch (level) {
    case "header":
      console.log(`\n${colors.cyan}${colors.bright}${message}${colors.reset}`);
      break;
    case "success":
      console.log(
        `${prefix} ${indentation}${colors.green}${symbols.success}${colors.reset} ${message}`,
      );
      break;
    case "error":
      console.log(
        `${prefix} ${indentation}${colors.red}${symbols.error}${colors.reset} ${message}`,
      );
      break;
    case "warning":
      console.log(
        `${prefix} ${indentation}${colors.yellow}${symbols.warning}${colors.reset} ${message}`,
      );
      break;
    case "info":
      console.log(
        `${prefix} ${indentation}${colors.blue}${symbols.info}${colors.reset} ${message}`,
      );
      break;
    case "processing":
      console.log(
        `${prefix} ${indentation}${colors.cyan}${symbols.gear}${colors.reset} ${message}`,
      );
      break;
    default:
      console.log(`${prefix} ${indentation}${message}`);
  }
}

// Display a formatted header with borders
function displayHeader(title, subtitle = "") {
  const width = 80;
  const titleLine = `${symbols.bitcoin} ${title} ${symbols.bitcoin}`;
  const padding = Math.max(0, Math.floor((width - titleLine.length) / 2));
  const border = "═".repeat(width);
  const paddedTitle = " ".repeat(padding) + titleLine + " ".repeat(padding);

  console.log(`\n${colors.cyan}${colors.bright}${border}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${paddedTitle}${colors.reset}`);
  if (subtitle) {
    const subtitlePadding = Math.max(
      0,
      Math.floor((width - subtitle.length) / 2),
    );
    const paddedSubtitle = " ".repeat(subtitlePadding) + subtitle +
      " ".repeat(subtitlePadding);
    console.log(`${colors.gray}${paddedSubtitle}${colors.reset}`);
  }
  console.log(`${colors.cyan}${colors.bright}${border}${colors.reset}\n`);
}

// Display help information with enhanced formatting
function showHelp() {
  displayHeader(
    "BITCOIN ETL RUNNER",
    "High-Performance Blockchain Data Extraction Tool",
  );

  console.log(colorize("USAGE:", "cyan", "bright"));
  console.log(
    `  ${colorize("node run.js", "white")} ${
      colorize("<start_height>", "yellow")
    } ${colorize("[end_height]", "gray")} ${colorize("[options]", "gray")}\n`,
  );

  console.log(colorize("ARGUMENTS:", "cyan", "bright"));
  console.log(
    `  ${colorize("start_height", "yellow").padEnd(20)} Starting block height ${
      colorize("(required)", "red")
    }`,
  );
  console.log(
    `  ${colorize("end_height", "gray").padEnd(20)} Ending block height ${
      colorize("(optional, defaults to start_height)", "gray")
    }\n`,
  );

  console.log(colorize("OPTIONS:", "cyan", "bright"));
  console.log(
    `  ${
      colorize("--verbose, -v", "green").padEnd(25)
    } Enable verbose logging with detailed output`,
  );
  console.log(
    `  ${
      colorize("--workers, -w <num>", "green").padEnd(25)
    } Number of worker processes ${
      colorize(`(default: ${Math.max(1, os.cpus().length - 1)})`, "gray")
    }`,
  );
  console.log(
    `  ${
      colorize("--batch-size, -b <num>", "green").padEnd(25)
    } Batch size for prefetching ${colorize("(default: 50)", "gray")}`,
  );
  console.log(
    `  ${
      colorize("--dry-run", "green").padEnd(25)
    } Validate configuration without processing`,
  );
  console.log(
    `  ${colorize("--help, -h", "green").padEnd(25)} Show this help message\n`,
  );

  console.log(colorize("EXAMPLES:", "cyan", "bright"));
  console.log(
    `  ${symbols.bullet} ${
      colorize("node run.js 800000", "white").padEnd(40)
    } Process single block`,
  );
  console.log(
    `  ${symbols.bullet} ${
      colorize("node run.js 800000 810000", "white").padEnd(40)
    } Process range of 10,001 blocks`,
  );
  console.log(
    `  ${symbols.bullet} ${
      colorize("node run.js 800000 810000 -w 16", "white").padEnd(40)
    } Use 16 workers for faster processing`,
  );
  console.log(
    `  ${symbols.bullet} ${
      colorize("node run.js 800000 810000 -b 100 -v", "white").padEnd(40)
    } Batch size 100 with verbose output`,
  );
  console.log(
    `  ${symbols.bullet} ${
      colorize("node run.js 800000 810000 --dry-run", "white").padEnd(40)
    } Validate configuration only\n`,
  );

  console.log(colorize("PERFORMANCE TIPS:", "magenta", "bright"));
  console.log(
    `  ${symbols.bullet} Use SSD storage for optimal database performance`,
  );
  console.log(
    `  ${symbols.bullet} Process older blocks (0-400k) with higher worker counts`,
  );
  console.log(
    `  ${symbols.bullet} Process newer blocks (400k+) with fewer workers to avoid DB contention`,
  );
  console.log(
    `  ${symbols.bullet} Monitor system memory usage during large batch processing\n`,
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

// Enhanced system requirements check
function checkSystemRequirements() {
  log("header", `${symbols.cpu} SYSTEM REQUIREMENTS CHECK`);

  // Check Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split(".")[0]);
  const nodeStatus = nodeMajor >= 16
    ? colorize("✓ Compatible", "green")
    : colorize("✗ Requires Node.js v16+", "red");
  log(
    "info",
    `Node.js Version: ${colorize(nodeVersion, "cyan")} ${nodeStatus}`,
  );

  // Check available memory
  const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const memStatus = totalMemGB >= 8
    ? colorize("✓ Adequate", "green")
    : colorize("⚠ Low (8GB+ recommended)", "yellow");
  log(
    "info",
    `System Memory: ${colorize(totalMemGB + "GB", "cyan")} total, ${
      colorize(freeMemGB + "GB", "cyan")
    } free ${memStatus}`,
  );

  // Check CPU cores
  const cpuCores = os.cpus().length;
  const cpuStatus = cpuCores >= 4
    ? colorize("✓ Good", "green")
    : colorize("⚠ Limited", "yellow");
  log(
    "info",
    `CPU Cores: ${colorize(cpuCores.toString(), "cyan")} ${cpuStatus}`,
  );

  // Check platform
  const platform = os.platform();
  const platformEmoji = platform === "win32"
    ? "🪟"
    : platform === "darwin"
    ? "🍎"
    : "🐧";
  log("info", `Platform: ${platformEmoji} ${colorize(platform, "cyan")}`);

  // Check disk space
  try {
    const stats = fs.statSync(__dirname);
    log("success", `Base Directory: ${colorize(__dirname, "gray")}`);
  } catch (error) {
    log("warning", `Could not check base directory: ${error.message}`);
  }

  console.log();
}

// Enhanced file verification
function verifyFiles() {
  log("header", `${symbols.gear} FILE VERIFICATION`);

  const requiredFiles = [
    {
      name: "index.js",
      path: path.resolve(__dirname, "src", "index.js"),
      desc: "Main ETL processor",
    },
    {
      name: "worker.js",
      path: path.resolve(__dirname, "src", "worker.js"),
      desc: "Worker process handler",
    },
    {
      name: "rpc.js",
      path: path.resolve(__dirname, "src", "rpc.js"),
      desc: "Bitcoin RPC client",
    },
    {
      name: "schema.js",
      path: path.resolve(__dirname, "db", "schema.js"),
      desc: "Database schema",
    },
    {
      name: "package.json",
      path: path.resolve(__dirname, "package.json"),
      desc: "Project configuration",
    },
  ];

  const missingFiles = [];

  requiredFiles.forEach((file) => {
    if (fs.existsSync(file.path)) {
      log("success", `${file.name}: ${colorize(file.desc, "gray")}`);
    } else {
      log(
        "error",
        `${file.name}: ${colorize("MISSING", "red")} - ${file.desc}`,
      );
      missingFiles.push(file.name);
    }
  });

  if (missingFiles.length > 0) {
    console.log();
    log(
      "error",
      `Missing required files: ${colorize(missingFiles.join(", "), "red")}`,
    );
    console.log();
    log("info", "Please ensure all project files are present and try again.");
    process.exit(1);
  }

  console.log();
}

// Enhanced configuration display
function displayConfiguration(config) {
  const totalBlocks = config.endHeight - config.startHeight + 1;

  log("header", `${symbols.gear} CONFIGURATION SUMMARY`);

  log(
    "info",
    `Block Range: ${
      colorize(config.startHeight.toLocaleString(), "cyan")
    } ${symbols.arrow} ${colorize(config.endHeight.toLocaleString(), "cyan")}`,
  );
  log(
    "info",
    `Total Blocks: ${
      colorize(totalBlocks.toLocaleString(), "yellow", "bright")
    }`,
  );
  log(
    "info",
    `Workers: ${colorize(config.workers.toString(), "cyan")} of ${
      colorize(os.cpus().length.toString(), "gray")
    } available cores`,
  );
  log(
    "info",
    `Batch Size: ${
      colorize(config.batchSize.toString(), "cyan")
    } blocks per prefetch`,
  );
  log(
    "info",
    `Verbose Mode: ${
      config.verbose
        ? colorize("Enabled", "green")
        : colorize("Disabled", "gray")
    }`,
  );
  log(
    "info",
    `Dry Run: ${
      config.dryRun ? colorize("Yes", "yellow") : colorize("No", "gray")
    }`,
  );

  console.log();

  // Performance estimates
  if (totalBlocks > 1000) {
    log("header", `${symbols.clock} TIME ESTIMATES`);

    // Rough time estimates based on block complexity
    let estimatedTimeMs = 0;

    // Early blocks are much faster
    const earlyBlocks = Math.min(
      totalBlocks,
      Math.max(0, 100000 - config.startHeight + 1),
    );
    const midBlocks = Math.min(
      totalBlocks - earlyBlocks,
      Math.max(0, 400000 - Math.max(config.startHeight, 100001) + 1),
    );
    const lateBlocks = totalBlocks - earlyBlocks - midBlocks;

    estimatedTimeMs += earlyBlocks * 100; // 100ms per early block
    estimatedTimeMs += midBlocks * 2000; // 2s per mid block
    estimatedTimeMs += lateBlocks * 8000; // 8s per late block

    // Adjust for parallelism (not perfectly linear)
    const parallelEfficiency = Math.min(1, config.workers / 4) * 0.8 + 0.2;
    estimatedTimeMs = estimatedTimeMs / (config.workers * parallelEfficiency);

    const hours = estimatedTimeMs / (1000 * 60 * 60);
    const days = hours / 24;

    if (days > 1) {
      log(
        "warning",
        `Estimated Duration: ${
          colorize(days.toFixed(1) + " days", "yellow")
        } (${hours.toFixed(1)} hours)`,
      );
    } else if (hours > 1) {
      log(
        "info",
        `Estimated Duration: ${colorize(hours.toFixed(1) + " hours", "cyan")}`,
      );
    } else {
      log(
        "info",
        `Estimated Duration: ${
          colorize(
            (estimatedTimeMs / (1000 * 60)).toFixed(0) + " minutes",
            "cyan",
          )
        }`,
      );
    }

    const completionTime = new Date(Date.now() + estimatedTimeMs);
    log(
      "info",
      `Estimated Completion: ${
        colorize(completionTime.toLocaleString(), "cyan")
      }`,
    );

    console.log();
  }

  // Show warnings if processing large ranges
  if (totalBlocks > 50000) {
    log(
      "warning",
      `Processing ${
        colorize(totalBlocks.toLocaleString(), "yellow")
      } blocks will take considerable time.`,
    );
    log(
      "info",
      "Consider processing in smaller chunks for better manageability.",
      1,
    );
    console.log();
  }

  // Memory usage estimates
  if (totalBlocks > 10000) {
    const estimatedMemoryMB = config.workers * 50 + config.batchSize * 2;
    log(
      "info",
      `Estimated Memory Usage: ${colorize(estimatedMemoryMB + "MB", "cyan")}`,
    );

    if (estimatedMemoryMB > 2000) {
      log(
        "warning",
        "High memory usage expected. Monitor system resources.",
        1,
      );
    }
    console.log();
  }
}

// Main execution with enhanced output
function main() {
  displayHeader(
    "BITCOIN ETL RUNNER",
    "Blockchain Data Extraction & Processing",
  );

  // Parse command line arguments
  const config = parseArguments();

  // Check system requirements
  checkSystemRequirements();

  // Verify required files exist
  verifyFiles();

  // Validate configuration
  const validation = validateConfiguration(config);
  if (validation.errors.length > 0) {
    log("header", `${symbols.error} CONFIGURATION ERRORS`);
    validation.errors.forEach((error) => {
      log("error", error);
    });
    console.log();
    showHelp();
    process.exit(1);
  }

  // Show warnings if any
  if (validation.warnings.length > 0) {
    log("header", `${symbols.warning} PERFORMANCE WARNINGS`);
    validation.warnings.forEach((warning) => {
      log("warning", warning);
    });
    console.log();
  }

  // Display configuration
  displayConfiguration(config);

  // If dry run, exit here
  if (config.dryRun) {
    log(
      "success",
      `${symbols.check} Dry run completed successfully. Configuration is valid.`,
    );
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

  log("header", `${symbols.rocket} STARTING ETL PROCESS`);
  log(
    "processing",
    `Command: ${colorize(`node src/index.js ${etlArgs.join(" ")}`, "white")}`,
  );
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
      log("success", `${symbols.check} ETL process completed successfully!`);
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
