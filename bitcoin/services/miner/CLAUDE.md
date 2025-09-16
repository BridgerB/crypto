# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a JavaScript/TypeScript Bitcoin mining implementation built with Deno. It demonstrates how Bitcoin mining works at a fundamental level by connecting to a Bitcoin Core node, fetching block templates, and performing the mining process (double SHA-256 hashing with nonce iteration).

## Development Commands

### Running the Miner
- `deno task start` - Run the main mining application (main.ts)
- `deno task benchmark` - Run performance benchmark (1M hashes)

### Manual Commands
- `deno run --allow-net main.ts` - Run main miner directly
- `deno run --allow-net benchmark.ts` - Run benchmark directly

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

### Dependencies

- **Deno runtime** - Uses Deno's built-in Web APIs (fetch, crypto)
- **Bitcoin Core node** - Requires running Bitcoin Core with RPC enabled
- **No external npm packages** - Pure Deno implementation

## Bitcoin Core Setup

The miner expects a Bitcoin Core node running locally with these RPC credentials:
- Host: 127.0.0.1:8332
- Username: bridger
- Password: password

Configure your bitcoin.conf accordingly or modify the credentials in rpc.ts:58-59.

## Important Notes

- This is an educational implementation - it will not find blocks on mainnet (hash rate too low)
- The mining loop runs indefinitely until a block is found (which statistically won't happen)
- Uses dummy merkle roots instead of calculating from real transactions
- Logs every single hash attempt for debugging/educational purposes
- CUDA directory exists but is currently empty (future GPU acceleration?)

## Code Patterns

- Uses TypeScript interfaces for all Bitcoin data structures
- Async/await pattern for all crypto operations
- Little-endian byte ordering for Bitcoin protocol compliance
- Hex string representations for hash values and block data
- Error handling with try/catch blocks and informative messages