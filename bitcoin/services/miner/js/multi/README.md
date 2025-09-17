# Real Bitcoin Miner - Multi-Threaded Implementation

A production-ready, multi-threaded Bitcoin mining implementation built with Deno
that can produce valid blocks accepted by the Bitcoin network.

## Overview

This is a complete Bitcoin mining system that:

- Connects to Bitcoin Core via RPC to fetch real block templates
- Calculates real merkle trees from transaction data
- Creates valid coinbase transactions
- Performs multi-threaded proof-of-work mining
- Produces network-compliant blocks that can be submitted to the blockchain

**Key Features:**

- Real Bitcoin protocol compliance (no dummy systems)
- Multi-threaded mining using Deno Workers (12 workers by default)
- Live block template management with 30-second refresh intervals
- Genesis block testing mode for validation
- Comprehensive transaction handling and coinbase creation
- Production-ready architecture with proper error handling

## Quick Start

### Prerequisites

1. **Bitcoin Core** running locally with RPC enabled
2. **Deno** runtime installed

### Bitcoin Core Setup

Configure your `bitcoin.conf`:

```
rpcuser=bridger
rpcpassword=password
rpcport=8332
rpcbind=127.0.0.1
server=1
```

### Running the Miner

```bash
# Genesis block testing (validates mining logic)
deno task start

# Live mining against Bitcoin Core
deno task start-live

# Performance benchmark
deno task benchmark-multi
```

## Architecture

### Core Components

#### Mining Engine (`mining/core.ts`)

- **Real merkle tree calculation** from transaction hashes
- **Double SHA-256** block header hashing with proper byte ordering
- **Target validation** using BigInt for 256-bit precision
- **Bitcoin protocol compliance** with little-endian/big-endian conversions

Key functions:

- `calculateMerkleRoot()` - Builds merkle tree from transactions
- `hashBlockHeader()` - Performs double SHA-256 with byte reversal
- `isValidHash()` - Compares hash against network difficulty target

#### Worker Pool (`worker.ts`, `pool-manager.ts`)

- **12 parallel workers** (one per CPU core)
- **Nonce range distribution** across workers
- **Real-time progress reporting** with hash rate statistics
- **Graceful shutdown** and error recovery

#### Template Management (`mining/template-manager.ts`)

- **Live Bitcoin Core integration** via RPC
- **30-second template refresh** for fresh transaction data
- **Worker coordination** during template updates
- **Automatic coinbase transaction creation**

#### Transaction Handling (`mining/transaction.ts`)

- **Complete transaction serialization** with proper Bitcoin encoding
- **Coinbase transaction creation** with BIP 34 block height compliance
- **Bitcoin address script generation** for mining rewards
- **Transaction input/output handling**

### Mining Modes

#### Genesis Block Testing

```bash
deno task start
```

Recreates the exact conditions of Bitcoin's genesis block to validate mining
logic. The system will naturally find the genesis block (nonce: 2083236893)
after approximately 6-8 hours of mining, proving the implementation is correct.

#### Live Mining

```bash
deno task start-live
```

Connects to your Bitcoin Core node and mines against live network templates with
real transactions. Updates block templates every 30 seconds to include fresh
transactions.

## Performance

**Hash Rate**: ~120-150 KH/s on modern 12-core CPU **Power Efficiency**:
Educational/validation purposes only **Theoretical Block Time**: Several years
(CPU mining on current difficulty)

### Benchmark Results

```bash
deno task benchmark-multi
```

Shows:

- Hash rate per worker and total
- CPU utilization across cores
- Theoretical time to find a block
- Performance comparison vs single-threaded

## Configuration

### RPC Connection (`rpc.ts`)

```typescript
const RPC_CONFIG = {
  host: "127.0.0.1",
  port: 8332,
  username: "bridger",
  password: "password",
};
```

### Mining Parameters (`main.ts`)

```typescript
const MINING_CONFIG = {
  workerCount: 12,
  templateRefreshInterval: 30000, // 30 seconds
  progressReportInterval: 5000, // 5 seconds
  payoutAddress: "your-bitcoin-address",
};
```

## File Structure

```
js/multi/
├── main.ts                    # Entry point and orchestration
├── worker.ts                  # Individual mining worker
├── pool-manager.ts           # Worker pool coordination
├── rpc.ts                    # Bitcoin Core RPC client
├── mining/
│   ├── core.ts              # Core mining algorithms
│   ├── genesis-template.ts   # Genesis block recreation
│   ├── template-manager.ts   # Live template management
│   └── transaction.ts        # Transaction handling
├── types/
│   ├── bitcoin.ts           # Bitcoin protocol types
│   └── shared-types.ts      # Worker communication types
├── crypto/
│   └── crypto.ts            # SHA-256 and utility functions
└── benchmark-multi.ts        # Performance testing
```

## Validation

The system has been validated by successfully mining the Bitcoin genesis block:

- **Target**: `00000000ffff0000000000000000000000000000000000000000000000000000`
- **Found nonce**: `2083236893`
- **Mining time**: ~6.5 hours (natural discovery)
- **Worker**: Worker 5 after 293,667,189 attempts

This proves the implementation correctly:

- Calculates merkle roots from transaction data
- Performs proper Bitcoin protocol hashing
- Validates proof-of-work against difficulty targets
- Produces network-compliant block headers

## Development

### Running Tests

```bash
# Crypto function validation
deno run --allow-net crypto/crypto.ts

# Genesis block validation
deno task start

# Live mining test
deno task start-live
```

### Adding Features

1. Modify mining parameters in `main.ts`
2. Extend worker communication in `types/shared-types.ts`
3. Add new RPC methods in `rpc.ts`
4. Enhance template management in `mining/template-manager.ts`

## Important Notes

- **Educational Purpose**: While production-ready, CPU mining won't find blocks
  on mainnet due to network difficulty
- **Network Compliance**: Produces valid blocks that would be accepted by
  Bitcoin Core
- **Resource Usage**: Utilizes all CPU cores for maximum hash rate
- **Template Updates**: Automatically refreshes with latest transactions every
  30 seconds
