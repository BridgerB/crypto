/**
 * Advanced CUDA configuration and optimization settings
 */

export interface CudaOptimizationConfig {
  // Process management
  maxConcurrentProcesses: number;
  processPoolSize: number;
  processReuseCount: number;

  // Performance tuning
  batchSize: number;
  nonceChunkSize: number;
  memoryOptimization: boolean;

  // GPU-specific optimizations
  useMultiStream: boolean;
  kernelOptimizations: string[];

  // Monitoring and diagnostics
  enableProfiling: boolean;
  performanceLogging: boolean;
}

export function createOptimalCudaConfig(): CudaOptimizationConfig {
  return {
    // Process management - reduce subprocess overhead
    maxConcurrentProcesses: 2, // Limit concurrent CUDA processes per worker
    processPoolSize: 4, // Pool of reusable processes
    processReuseCount: 100, // Reuse process 100 times before recycling

    // Performance tuning - maximize throughput
    batchSize: 50, // Process 50 extraNonce values per batch
    nonceChunkSize: 4294967295, // Use full 32-bit nonce range
    memoryOptimization: true, // Enable GPU memory optimizations

    // GPU-specific optimizations
    useMultiStream: true, // Enable CUDA streams for parallel processing
    kernelOptimizations: [
      "--ptxas-options=-v", // Verbose PTX assembly for optimization
      "-O3", // Maximum compiler optimization
      "--use_fast_math", // Fast math operations
      "--maxrregcount=32", // Optimize register usage
    ],

    // Monitoring and diagnostics
    enableProfiling: false, // Disable in production for performance
    performanceLogging: true, // Log performance metrics
  };
}

export interface CudaPerformanceMetrics {
  hashRate: number;
  effectiveHashRate: number;
  gpuUtilization: number;
  memoryUsage: number;
  processOverhead: number;
  averageKernelTime: number;
}

export class CudaPerformanceMonitor {
  private metrics: CudaPerformanceMetrics[] = [];
  private startTime: number = 0;
  private totalHashes: number = 0;

  startMining(): void {
    this.startTime = Date.now();
    this.totalHashes = 0;
    this.metrics = [];
  }

  recordKernelExecution(
    hashes: number,
    executionTimeMs: number,
    gpuUtilization: number = 0,
    memoryUsage: number = 0,
  ): void {
    const hashRate = hashes / (executionTimeMs / 1000);
    this.totalHashes += hashes;

    const elapsedMs = Date.now() - this.startTime;
    const effectiveHashRate = this.totalHashes / (elapsedMs / 1000);

    this.metrics.push({
      hashRate,
      effectiveHashRate,
      gpuUtilization,
      memoryUsage,
      processOverhead: executionTimeMs > 0 ? (executionTimeMs / 1000) : 0,
      averageKernelTime: executionTimeMs,
    });

    // Keep only recent metrics (last 100 records)
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }
  }

  getAverageMetrics(): CudaPerformanceMetrics | null {
    if (this.metrics.length === 0) return null;

    const sum = this.metrics.reduce((acc, metric) => ({
      hashRate: acc.hashRate + metric.hashRate,
      effectiveHashRate: acc.effectiveHashRate + metric.effectiveHashRate,
      gpuUtilization: acc.gpuUtilization + metric.gpuUtilization,
      memoryUsage: acc.memoryUsage + metric.memoryUsage,
      processOverhead: acc.processOverhead + metric.processOverhead,
      averageKernelTime: acc.averageKernelTime + metric.averageKernelTime,
    }), {
      hashRate: 0,
      effectiveHashRate: 0,
      gpuUtilization: 0,
      memoryUsage: 0,
      processOverhead: 0,
      averageKernelTime: 0,
    });

    const count = this.metrics.length;
    return {
      hashRate: sum.hashRate / count,
      effectiveHashRate: sum.effectiveHashRate / count,
      gpuUtilization: sum.gpuUtilization / count,
      memoryUsage: sum.memoryUsage / count,
      processOverhead: sum.processOverhead / count,
      averageKernelTime: sum.averageKernelTime / count,
    };
  }

  getCurrentEffectiveHashRate(): number {
    const elapsedMs = Date.now() - this.startTime;
    return elapsedMs > 0 ? this.totalHashes / (elapsedMs / 1000) : 0;
  }

  getTotalHashes(): number {
    return this.totalHashes;
  }

  getRuntime(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Calculates optimal CUDA parameters based on system capabilities
 */
export function calculateOptimalParameters(
  systemInfo: {
    gpuMemoryMB: number;
    cudaCores: number;
    maxThreadsPerBlock: number;
    maxBlocksPerSM: number;
  },
): {
  threadsPerBlock: number;
  blocksPerGrid: number;
  sharedMemorySize: number;
  optimalBatchSize: number;
} {
  // Calculate optimal thread configuration
  const threadsPerBlock = Math.min(256, systemInfo.maxThreadsPerBlock);

  // Calculate blocks per grid based on CUDA cores
  const totalThreads = systemInfo.cudaCores;
  const blocksPerGrid = Math.min(
    65535,
    Math.floor(totalThreads / threadsPerBlock),
  );

  // Calculate shared memory usage (for block header and target)
  const sharedMemorySize = 80 + 32; // Block header + target in bytes

  // Calculate optimal batch size based on GPU memory
  const memoryPerBatch = sharedMemorySize * blocksPerGrid;
  const maxBatches = Math.floor(
    (systemInfo.gpuMemoryMB * 1024 * 1024 * 0.8) / memoryPerBatch,
  );
  const optimalBatchSize = Math.min(100, Math.max(10, maxBatches));

  return {
    threadsPerBlock,
    blocksPerGrid,
    sharedMemorySize,
    optimalBatchSize,
  };
}

/**
 * Advanced CUDA optimization strategies
 */
export const CudaOptimizationStrategies = {
  /**
   * High-throughput strategy for maximum hash rate
   */
  HighThroughput: {
    processPoolSize: 8,
    batchSize: 100,
    useMultiStream: true,
    kernelOptimizations: [
      "--ptxas-options=-v",
      "-O3",
      "--use_fast_math",
      "--maxrregcount=32",
      "--ftz=true", // Flush denormalized floats to zero
    ],
  },

  /**
   * Low-latency strategy for responsive mining
   */
  LowLatency: {
    processPoolSize: 2,
    batchSize: 10,
    useMultiStream: false,
    kernelOptimizations: [
      "-O2",
      "--use_fast_math",
    ],
  },

  /**
   * Balanced strategy for general-purpose mining
   */
  Balanced: {
    processPoolSize: 4,
    batchSize: 25,
    useMultiStream: true,
    kernelOptimizations: [
      "-O3",
      "--use_fast_math",
      "--maxrregcount=24",
    ],
  },

  /**
   * Memory-optimized strategy for limited GPU memory
   */
  MemoryOptimized: {
    processPoolSize: 2,
    batchSize: 5,
    useMultiStream: false,
    kernelOptimizations: [
      "-O2",
      "--maxrregcount=16",
    ],
  },
} as const;

export type OptimizationStrategy = keyof typeof CudaOptimizationStrategies;
