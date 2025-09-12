// test/time-estimate2.js
/**
 * Bitcoin ETL Quick Time Estimator (Enhanced)
 *
 * Tests small ranges (10 blocks each) at different blockchain heights
 * and uses maximum available parallelism for optimal performance measurements.
 */

// Sample data from previous benchmarks
const sampleData = [
  { height: 0, time: 53 },
  { height: 100000, time: 64 },
  { height: 200000, time: 2155 },
  { height: 300000, time: 1407 },
  { height: 400000, time: 8093 },
  { height: 500000, time: 10319 },
  { height: 600000, time: 7536 },
  { height: 700000, time: 10471 },
  { height: 800000, time: 15442 },
  // Recent consecutive blocks
  { height: 897010, time: 16594 },
  { height: 897011, time: 15932 },
  { height: 897012, time: 10485 },
  { height: 897013, time: 18002 },
  { height: 897014, time: 15380 },
  { height: 897015, time: 17045 },
];

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Define smaller test ranges (10 blocks each)
const TEST_RANGES = [
  { start: 0, end: 9, label: "0-100k (genesis)" },
  { start: 100000, end: 100009, label: "100k (2011)" },
  { start: 200000, end: 200009, label: "200k (2012)" },
  { start: 300000, end: 300009, label: "300k (2014)" },
  { start: 400000, end: 400009, label: "400k (2016)" },
  { start: 500000, end: 500009, label: "500k (2017)" },
  { start: 600000, end: 600009, label: "600k (2019)" },
  { start: 700000, end: 700009, label: "700k (2021)" },
  { start: 800000, end: 800009, label: "800k (2023)" },
];

// Configuration
const TOTAL_BLOCKS = 897500; // Approximate current block height
const WORKERS_PER_TEST = Math.max(os.cpus().length - 1, 1); // Use max available cores
const ALLOW_CACHED = true; // If true, use cached results if available

// Results storage
let testResults = [];
const resultsFile = path.join(__dirname, "benchmark-results.json");

// Utility functions
function formatTime(milliseconds) {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(2)}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  } else if (milliseconds < 3600000) {
    return `${(milliseconds / 60000).toFixed(2)}min`;
  } else if (milliseconds < 86400000) {
    return `${(milliseconds / 3600000).toFixed(2)}h`;
  } else {
    return `${(milliseconds / 86400000).toFixed(2)}d`;
  }
}

// Load cached results if they exist
function loadCachedResults() {
  if (ALLOW_CACHED && fs.existsSync(resultsFile)) {
    try {
      const data = fs.readFileSync(resultsFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error loading cached results:", error);
    }
  }
  return null;
}

// Save results to cache
function saveResults(results) {
  try {
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2), "utf8");
    console.log(`Results saved to ${resultsFile}`);
  } catch (error) {
    console.error("Error saving results:", error);
  }
}

// Run a single test range and measure performance
async function runTestRange(range) {
  return new Promise((resolve, reject) => {
    console.log(
      `\nTesting range ${range.start}-${range.end} (${range.label})...`,
    );

    const startTime = Date.now();
    const indexPath = path.join(projectRoot, "src", "index.js");

    // Build arguments
    const args = [
      indexPath,
      range.start.toString(),
      range.end.toString(),
      "--workers",
      WORKERS_PER_TEST.toString(),
    ];

    console.log(
      `Command: node ${args.join(" ")} (using ${WORKERS_PER_TEST} workers)`,
    );

    // Set the environment variable for the base directory
    const env = {
      ...process.env,
      BTC_ETL_BASE_DIR: projectRoot,
    };

    // Spawn the ETL process
    const etl = spawn("node", args, {
      env,
      stdio: ["pipe", "pipe", "pipe"], // capture all output
    });

    // Collect output
    let output = "";

    etl.stdout.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      // Show real-time output
      process.stdout.write(chunk);
    });

    etl.stderr.on("data", (data) => {
      const chunk = data.toString();
      console.error(chunk);
      output += chunk;
    });

    etl.on("close", (code) => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (code !== 0) {
        console.error(
          `Test for range ${range.start}-${range.end} failed with code ${code}`,
        );

        // If real tests fail, use sample data as fallback
        const sampleRange = range.start < 100
          ? sampleData.find((d) => d.height === 0)
          : sampleData.find(
            (d) => d.height >= range.start && d.height < range.start + 10000,
          ) ||
            sampleData.find((d) => Math.abs(d.height - range.start) < 10000);

        if (sampleRange) {
          console.log(
            `Using sample data for range ${range.start}-${range.end}`,
          );
          const msPerBlock = sampleRange.time;
          resolve({
            range: range,
            startBlock: range.start,
            endBlock: range.end,
            blockCount: range.end - range.start + 1,
            totalTimeMs: msPerBlock * (range.end - range.start + 1),
            msPerBlock: msPerBlock,
            blocksPerSecond: 1000 / msPerBlock,
            timestamp: new Date().toISOString(),
            simulated: true,
          });
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
        return;
      }

      // Extract processing speed from output
      const summaryMatch = output.match(
        /Processing speed: ([\d.]+) blocks\/sec/,
      );
      const blocksPerSecond = summaryMatch
        ? parseFloat(summaryMatch[1])
        : (range.end - range.start + 1) / (duration / 1000);

      // Calculate time per block
      const msPerBlock = 1000 / blocksPerSecond;

      console.log(
        `Range ${range.start}-${range.end} completed in ${
          formatTime(
            duration,
          )
        }`,
      );
      console.log(
        `Average: ${msPerBlock.toFixed(2)}ms per block, ${
          blocksPerSecond.toFixed(
            2,
          )
        } blocks/sec`,
      );

      resolve({
        range: range,
        startBlock: range.start,
        endBlock: range.end,
        blockCount: range.end - range.start + 1,
        totalTimeMs: duration,
        msPerBlock: msPerBlock,
        blocksPerSecond: blocksPerSecond,
        timestamp: new Date().toISOString(),
      });
    });

    etl.on("error", (err) => {
      console.error(
        `Error running test for range ${range.start}-${range.end}:`,
        err,
      );
      reject(err);
    });
  });
}

// Run all test ranges
async function runAllTests() {
  const cachedResults = loadCachedResults();
  if (cachedResults && cachedResults.length > 0) {
    console.log("Using cached benchmark results");
    testResults = cachedResults;
    analyzeResults();
    return;
  }

  console.log("Starting comprehensive benchmark tests...");
  console.log(
    `Testing ${TEST_RANGES.length} block ranges with ${WORKERS_PER_TEST} workers each`,
  );
  console.log(
    `Using ${WORKERS_PER_TEST} of ${os.cpus().length} available CPU cores`,
  );

  let allTestsFailed = true;

  for (const range of TEST_RANGES) {
    try {
      const result = await runTestRange(range);
      testResults.push(result);
      if (!result.simulated) {
        allTestsFailed = false;
      }
    } catch (error) {
      console.error(`Failed to test range ${range.start}-${range.end}:`, error);
    }
  }

  // If all tests failed, use sample data as fallback
  if (allTestsFailed && testResults.length === 0) {
    console.log("All tests failed. Using sample data for estimation.");
    for (const range of TEST_RANGES) {
      // Find closest sample data
      const sampleData = range.start < 100
        ? { height: 0, time: 53 }
        : samples.find(
          (d) => d.height >= range.start && d.height < range.start + 10000,
        ) ||
          samples.find((d) => Math.abs(d.height - range.start) < 10000) || {
          height: range.start,
          time: range.start > 800000 ? 15000 : 5000,
        };

      testResults.push({
        range: range,
        startBlock: range.start,
        endBlock: range.end,
        blockCount: range.end - range.start + 1,
        msPerBlock: sampleData.time,
        blocksPerSecond: 1000 / sampleData.time,
        totalTimeMs: sampleData.time * (range.end - range.start + 1),
        timestamp: new Date().toISOString(),
        simulated: true,
      });
    }
  }

  // Save the results for future use
  saveResults(testResults);

  // Analyze the results
  analyzeResults();
}

// Analyze test results and provide detailed estimates
function analyzeResults() {
  if (testResults.length === 0) {
    console.error("No test results available for analysis");
    return;
  }

  console.log("\n===============================================");
  console.log("BITCOIN ETL COMPREHENSIVE TIME ESTIMATE");
  console.log("===============================================");

  // Sort results by start block
  testResults.sort((a, b) => a.startBlock - b.startBlock);

  // Display individual test results
  console.log("\nTest Results:");
  console.log("-------------");
  testResults.forEach((result) => {
    const simulated = result.simulated ? "(simulated)" : "";
    console.log(
      `${result.range.label.padEnd(20)} | ${
        result.msPerBlock
          .toFixed(2)
          .padStart(8)
      }ms/block | ${
        result.blocksPerSecond
          .toFixed(2)
          .padStart(7)
      } blocks/sec ${simulated}`,
    );
  });

  // Define block ranges for estimation based on test results
  const ranges = [];
  for (let i = 0; i < testResults.length; i++) {
    const currentTest = testResults[i];
    const nextTest = testResults[i + 1];

    // Determine the end of this range
    let rangeEnd;
    if (nextTest) {
      // Use halfway point between current and next test
      rangeEnd =
        Math.floor((currentTest.startBlock + nextTest.startBlock) / 2) - 1;
    } else {
      // Last range goes to the end
      rangeEnd = TOTAL_BLOCKS;
    }

    // Determine the start of this range
    let rangeStart;
    if (i === 0) {
      rangeStart = 0;
    } else {
      // Use halfway point between previous and current test
      rangeStart = Math.floor(
        (testResults[i - 1].startBlock + currentTest.startBlock) / 2,
      );
    }

    // Only include range if it has blocks in it
    if (rangeEnd >= rangeStart) {
      ranges.push({
        min: rangeStart,
        max: rangeEnd,
        msPerBlock: currentTest.msPerBlock,
        label: currentTest.range.label,
      });
    }
  }

  // Calculate total processing time
  let totalTimeMs = 0;
  let totalBlocks = 0;

  console.log("\nDetailed Estimation by Block Range:");
  console.log("----------------------------------");

  ranges.forEach((range) => {
    const blocksInRange = range.max - range.min + 1;
    const timeForRange = blocksInRange * range.msPerBlock;
    totalTimeMs += timeForRange;
    totalBlocks += blocksInRange;

    console.log(
      `${range.label.padEnd(20)} | ${
        range.min
          .toLocaleString()
          .padStart(
            8,
          )
      } - ${range.max.toLocaleString().padStart(8)} | ${
        blocksInRange
          .toLocaleString()
          .padStart(8)
      } blocks | ${formatTime(timeForRange).padStart(10)}`,
    );
  });

  // Adjust for parallelism
  const parallelTimeMs = totalTimeMs / WORKERS_PER_TEST;

  // Calculate overall statistics
  const avgMsPerBlock = totalTimeMs / totalBlocks;
  const totalSeconds = parallelTimeMs / 1000;
  const totalMinutes = totalSeconds / 60;
  const totalHours = totalMinutes / 60;
  const totalDays = totalHours / 24;

  // Calculate overall averages
  const overallAverage = {
    blocksPerSecond: 1000 / avgMsPerBlock,
    msPerBlock: avgMsPerBlock,
  };

  console.log("\nOverall Estimates:");
  console.log("------------------");
  console.log(`Total Blocks: ${totalBlocks.toLocaleString()}`);
  console.log(
    `Average Speed: ${overallAverage.msPerBlock.toFixed(2)}ms per block (${
      overallAverage.blocksPerSecond.toFixed(
        2,
      )
    } blocks/sec)`,
  );
  console.log(
    `\nTotal Processing Time with ${WORKERS_PER_TEST} workers: ${
      formatTime(
        parallelTimeMs,
      )
    }`,
  );
  console.log(`  • ${totalSeconds.toLocaleString()} seconds`);
  console.log(`  • ${totalMinutes.toLocaleString()} minutes`);
  console.log(`  • ${totalHours.toLocaleString()} hours`);
  console.log(`  • ${totalDays.toLocaleString()} days`);

  // Calculate estimated completion date
  const now = new Date();
  const completionDate = new Date(now.getTime() + parallelTimeMs);
  console.log(
    `\nEstimated completion date: ${completionDate.toLocaleString()}`,
  );

  // Calculate parallel processing estimates
  console.log("\nParallel Processing Estimates:");
  console.log("------------------------------");
  [4, 8, 16, 32, 64].forEach((workerCount) => {
    if (workerCount === WORKERS_PER_TEST) {
      console.log(
        `With ${workerCount} workers: ${totalDays.toFixed(2)} days (baseline)`,
      );
    } else {
      // Simple scaling (not perfectly linear but a reasonable approximation)
      const scaleFactor = Math.min(
        workerCount / WORKERS_PER_TEST,
        Math.sqrt(workerCount / WORKERS_PER_TEST),
      ); // Non-linear scaling for realism
      const scaledDays = totalDays / scaleFactor;
      console.log(
        `With ${workerCount} workers: ${scaledDays.toFixed(2)} days (${
          (
            totalDays / scaledDays
          ).toFixed(2)
        }x faster)`,
      );
    }
  });

  // Database scaling estimates
  console.log("\nDatabase Configurations:");
  console.log("------------------------");
  [
    { name: "Standard HDD", factor: 1.0 },
    { name: "SSD", factor: 0.5 },
    { name: "NVMe SSD", factor: 0.3 },
    { name: "Provisioned IOPS SSD", factor: 0.2 },
  ].forEach((storage) => {
    const adjustedDays = totalDays * storage.factor;
    console.log(
      `${storage.name.padEnd(20)}: ${
        adjustedDays.toFixed(
          2,
        )
      } days with ${WORKERS_PER_TEST} workers`,
    );
  });

  // Add hardware recommendations
  console.log("\nRecommendations:");
  console.log("---------------");
  console.log("1. For optimal processing speed:");
  console.log("   • Use an SSD with high IOPS for the database");
  console.log("   • Ensure adequate RAM (32GB+ recommended)");
  console.log("   • Use a machine with 8+ CPU cores");
  console.log("2. Consider processing in stages:");
  console.log(
    "   • Process older blocks (0-400k) first with higher parallelism",
  );
  console.log(
    "   • Process newer blocks with lower parallelism to avoid database contention",
  );
  console.log("3. Database optimization:");
  console.log("   • Increase PostgreSQL shared_buffers and work_mem");
  console.log("   • Consider setting random_page_cost=1.1 for SSDs");
  console.log("   • Optimize indexes after bulk loading");
  console.log(
    "   • Use a smaller worker count (4-8) for database-intensive operations",
  );
  console.log("4. Batch processing options:");
  console.log("   • Process in 50k-100k block chunks");
  console.log(
    "   • Consider using database partitioning by block height ranges",
  );

  const hasSimulated = testResults.some((r) => r.simulated);
  if (hasSimulated) {
    console.log(
      "\nNote: Some or all test results were simulated. Run actual tests for more accuracy.",
    );
  }
}

// Main function
async function main() {
  try {
    await runAllTests();
  } catch (error) {
    console.error("Error running tests:", error);
    process.exit(1);
  }
}

// Run the main function
main();
