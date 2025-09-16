# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a JavaScript/TypeScript Bitcoin mining implementation built with Deno.
It demonstrates how Bitcoin mining works at a fundamental level by connecting to
a Bitcoin Core node, fetching block templates, and performing the mining process
(double SHA-256 hashing with nonce iteration). Available in both single-threaded
and multi-threaded implementations.

## Development Commands

### Single-Threaded Miner (js/single/)

- `deno task start` - Run single-threaded miner
- `deno task benchmark` - Run single-threaded benchmark (1M hashes)

### Multi-Threaded Miner (js/multi/)

- `deno task start` or `deno task start-multi` - Run multi-threaded miner (12
  workers)
- `deno task benchmark-multi` - Run multi-threaded benchmark

### Manual Commands

- `deno run --allow-net main.ts` - Run single-threaded miner directly
- `deno run --allow-net --allow-read main.ts` - Run multi-threaded miner
  directly

## Code Architecture

### Core Modules

**main.ts** - Entry point that orchestrates the mining process:

- Runs crypto tests and debugging functions
- Connects to Bitcoin Core RPC
- Validates real Bitcoin data
- Starts the mining loop

**miner.ts** - Core mining implementation:

- Creates block headers from block templates
- Implements infinite nonce iteration loop
- Performs double SHA-256 hashing
- Checks hash against network target
- Logs every hash attempt

**rpc.ts** - Bitcoin Core RPC client:

- Handles JSON-RPC communication with Bitcoin Core
- Implements `getblocktemplate` method
- Default connection: localhost:8332, user: bridger, pass: password
- Contains TypeScript interfaces for Bitcoin RPC data structures

**block.ts** - Bitcoin block header manipulation:

- Serializes 80-byte block headers with proper byte ordering
- Handles little-endian and big-endian conversions for Bitcoin protocol
- Creates dummy merkle roots (real mining would calculate from transactions)

**crypto.ts** - Cryptographic utilities:

- Implements SHA-256 and double SHA-256 using Web Crypto API
- Provides hex/byte conversion utilities
- All Bitcoin hashing uses double SHA-256

**debug.ts** - Testing and validation functions:

- Tests crypto implementations against known vectors
- Validates real Bitcoin data processing
- Logs mining statistics and block template information

**benchmark.ts** - Performance measurement tool:

- Measures hash rate over 1M iterations
- Calculates theoretical time to find a block
- Shows mining profitability projections

### Multi-Threaded Modules (js/multi/ only)

**worker.ts** - Individual mining worker implementation:

- Runs in separate thread via Deno Workers
- Mines assigned nonce range independently
- Reports progress and results back to main thread
- Gracefully handles stop signals

**pool-manager.ts** - Worker pool coordinator:

- Creates and manages 12 worker threads
- Distributes nonce ranges across workers
- Aggregates progress reports and hash rates
- Handles worker lifecycle and error recovery

**shared-types.ts** - Worker communication interfaces:

- Defines message types between main thread and workers
- Ensures type safety for worker communication
- Contains configuration and statistics interfaces

**benchmark-multi.ts** - Multi-threaded performance benchmark:

- Tests performance across all CPU cores
- Compares multi-threaded vs single-threaded performance
- Shows CPU utilization and speedup metrics

### Dependencies

- **Deno runtime** - Uses Deno's built-in Web APIs (fetch, crypto, Workers)
- **Bitcoin Core node** - Requires running Bitcoin Core with RPC enabled
- **No external npm packages** - Pure Deno implementation
- **Multi-threading** - Uses Deno Workers for parallel processing

## Bitcoin Core Setup

The miner expects a Bitcoin Core node running locally with these RPC
credentials:

- Host: 127.0.0.1:8332
- Username: bridger
- Password: password

Configure your bitcoin.conf accordingly or modify the credentials in
rpc.ts:58-59.

## Important Notes

- This is an educational implementation - it will not find blocks on mainnet
  (hash rate too low)
- **Single-threaded**: Mining loop runs indefinitely, logs every hash attempt
- **Multi-threaded**: Uses 12 workers (one per CPU core), aggregated progress
  reporting
- Uses dummy merkle roots instead of calculating from real transactions
- Multi-threaded version provides ~12x performance improvement over
  single-threaded
- Requires `--allow-read` permission for multi-threaded version (worker file
  access)
- CUDA directory exists but is currently empty (future GPU acceleration?)

## Code Patterns

- Uses TypeScript interfaces for all Bitcoin data structures
- Async/await pattern for all crypto operations
- Little-endian byte ordering for Bitcoin protocol compliance
- Hex string representations for hash values and block data
- Error handling with try/catch blocks and informative messages
