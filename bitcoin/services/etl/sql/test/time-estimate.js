// test/time-estimate.js
/**
 * Bitcoin ETL time estimator
 * Estimates total processing time based on sample data showing how processing time
 * varies with block height
 */

// Sample data from your provided logs
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

// Total blocks to process
const TOTAL_BLOCKS = 897499;
// Blocks already processed (if any)
const BLOCKS_ALREADY_PROCESSED = 0;
// Remaining blocks to process
const REMAINING_BLOCKS = TOTAL_BLOCKS - BLOCKS_ALREADY_PROCESSED;

// Function to estimate processing time
function estimateProcessingTime() {
  console.log("Bitcoin ETL Time Estimator");
  console.log("==========================");
  console.log(`Total blocks: ${TOTAL_BLOCKS}`);
  console.log(`Blocks already processed: ${BLOCKS_ALREADY_PROCESSED}`);
  console.log(`Remaining blocks to process: ${REMAINING_BLOCKS}`);
  console.log("==========================");

  // Calculate average processing time by dividing blocks into ranges
  // Early blocks (0-100k) are much faster than later blocks

  // Define block ranges for estimation
  const ranges = [
    { min: 0, max: 100000, label: "0-100k" },
    { min: 100001, max: 200000, label: "100k-200k" },
    { min: 200001, max: 400000, label: "200k-400k" },
    { min: 400001, max: 600000, label: "400k-600k" },
    { min: 600001, max: 800000, label: "600k-800k" },
    { min: 800001, max: TOTAL_BLOCKS, label: "800k+" },
  ];

  // Calculate average processing time for each range
  const averageTimeByRange = ranges.map((range) => {
    const samplesInRange = sampleData.filter(
      (sample) => sample.height >= range.min && sample.height <= range.max,
    );

    const avgTime = samplesInRange.length > 0
      ? samplesInRange.reduce((sum, sample) => sum + sample.time, 0) /
        samplesInRange.length
      : 0;

    // Count blocks in this range that still need to be processed
    const blocksInRange = Math.min(range.max, TOTAL_BLOCKS) -
      Math.max(range.min, BLOCKS_ALREADY_PROCESSED);
    const adjustedBlocksInRange = blocksInRange > 0 ? blocksInRange : 0;

    // Total time for this range in milliseconds
    const totalTimeMs = avgTime * adjustedBlocksInRange;

    return {
      ...range,
      avgProcessingTimeMs: avgTime,
      blocksToProcess: adjustedBlocksInRange,
      totalTimeMs: totalTimeMs,
    };
  });

  // Calculate grand total time
  const totalTimeMs = averageTimeByRange.reduce(
    (sum, range) => sum + range.totalTimeMs,
    0,
  );

  // Convert to more readable time units
  const totalSeconds = totalTimeMs / 1000;
  const totalMinutes = totalSeconds / 60;
  const totalHours = totalMinutes / 60;
  const totalDays = totalHours / 24;

  // Display estimation for each range
  console.log("Estimation breakdown by block range:");
  console.log("-----------------------------------");
  averageTimeByRange.forEach((range) => {
    if (range.blocksToProcess > 0) {
      console.log(
        `${range.label}: ${range.blocksToProcess.toLocaleString()} blocks × ${
          range.avgProcessingTimeMs.toFixed(
            2,
          )
        }ms = ${formatTime(range.totalTimeMs / 1000)}`,
      );
    }
  });

  console.log("\nTotal estimated processing time:");
  console.log("-----------------------------------");
  console.log(`${totalSeconds.toLocaleString()} seconds`);
  console.log(`${totalMinutes.toLocaleString()} minutes`);
  console.log(`${totalHours.toLocaleString()} hours`);
  console.log(`${totalDays.toLocaleString()} days`);

  // Calculate estimated completion date
  const now = new Date();
  const completionDate = new Date(now.getTime() + totalTimeMs);
  console.log(
    `\nEstimated completion date: ${completionDate.toLocaleString()}`,
  );

  // Early blocks vs later blocks stats
  const earlyBlockAvg = sampleData
    .filter((sample) => sample.height < 100000)
    .reduce((sum, sample) => sum + sample.time, 0) /
    sampleData.filter((sample) => sample.height < 100000).length;

  const lateBlockAvg = sampleData
    .filter((sample) => sample.height > 800000)
    .reduce((sum, sample) => sum + sample.time, 0) /
    sampleData.filter((sample) => sample.height > 800000).length;

  console.log("\nProcessing speed comparison:");
  console.log(
    `Early blocks (< 100k): ~${earlyBlockAvg.toFixed(2)}ms per block`,
  );
  console.log(
    `Recent blocks (> 800k): ~${lateBlockAvg.toFixed(2)}ms per block`,
  );
  console.log(
    `Ratio: Recent blocks take ${
      (lateBlockAvg / earlyBlockAvg).toFixed(
        1,
      )
    }× longer than early blocks`,
  );

  // Parallel processing estimate
  console.log("\nParallel processing estimates:");
  [2, 4, 8, 16].forEach((cores) => {
    // Simplified parallel estimate (doesn't account for overhead)
    const parallelDays = totalDays / cores;
    console.log(`With ${cores} cores: ~${parallelDays.toFixed(2)} days`);
  });
}

// Helper function to format time in a readable format
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(2)} seconds`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(2)} minutes`;
  } else if (seconds < 86400) {
    return `${(seconds / 3600).toFixed(2)} hours`;
  } else {
    return `${(seconds / 86400).toFixed(2)} days`;
  }
}

// Run the estimation
estimateProcessingTime();

// REAL OUTPUT:
// node temp/estimatec.js
// Bitcoin ETL Time Estimator
// ==========================
// Total blocks: 897499
// Blocks already processed: 0
// Remaining blocks to process: 897499
// ==========================
// Estimation breakdown by block range:
// -----------------------------------
// 0-100k: 100,000 blocks × 58.50ms = 1.63 hours
// 100k-200k: 99,999 blocks × 2155.00ms = 2.49 days
// 200k-400k: 199,999 blocks × 4750.00ms = 11.00 days
// 400k-600k: 199,999 blocks × 8927.50ms = 20.67 days
// 600k-800k: 199,999 blocks × 12956.50ms = 29.99 days
// 800k+: 97,498 blocks × 15573.00ms = 17.57 days

// Total estimated processing time:
// -----------------------------------
// 7,066,457.565 seconds
// 117,774.293 minutes
// 1,962.905 hours
// 81.788 days

// Estimated completion date: 8/9/2025, 5:31:26 PM

// Processing speed comparison:
// Early blocks (< 100k): ~53.00ms per block
// Recent blocks (> 800k): ~15573.00ms per block
// Ratio: Recent blocks take 293.8× longer than early blocks

// Parallel processing estimates:
// With 2 cores: ~40.89 days
// With 4 cores: ~20.45 days
// With 8 cores: ~10.22 days
// With 16 cores: ~5.11 daysnode temp/estimatec.js
// Bitcoin ETL Time Estimator
// ==========================
// Total blocks: 897499
// Blocks already processed: 0
// Remaining blocks to process: 897499
// ==========================
// Estimation breakdown by block range:
// -----------------------------------
// 0-100k: 100,000 blocks × 58.50ms = 1.63 hours
// 100k-200k: 99,999 blocks × 2155.00ms = 2.49 days
// 200k-400k: 199,999 blocks × 4750.00ms = 11.00 days
// 400k-600k: 199,999 blocks × 8927.50ms = 20.67 days
// 600k-800k: 199,999 blocks × 12956.50ms = 29.99 days
// 800k+: 97,498 blocks × 15573.00ms = 17.57 days

// Total estimated processing time:
// -----------------------------------
// 7,066,457.565 seconds
// 117,774.293 minutes
// 1,962.905 hours
// 81.788 days

// Estimated completion date: 8/9/2025, 5:31:26 PM

// Processing speed comparison:
// Early blocks (< 100k): ~53.00ms per block
// Recent blocks (> 800k): ~15573.00ms per block
// Ratio: Recent blocks take 293.8× longer than early blocks

// Parallel processing estimates:
// With 2 cores: ~40.89 days
// With 4 cores: ~20.45 days
// With 8 cores: ~10.22 days
// With 16 cores: ~5.11 days
