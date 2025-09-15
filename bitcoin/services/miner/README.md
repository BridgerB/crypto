# Bitcoin Mining Process

This directory contains a JavaScript implementation of Bitcoin mining that demonstrates how the process works at a fundamental level.

## How Bitcoin Mining Works

Bitcoin mining is the process of creating new blocks for the Bitcoin blockchain. Here's the step-by-step process:

### 1. Get Block Template from Network
- Connect to a Bitcoin Core node via RPC
- Request a "block template" that tells you what the next block should contain
- This includes:
  - Previous block's hash (links to the existing chain)
  - List of pending transactions to include
  - Target difficulty (how hard the puzzle is)
  - Coinbase reward amount (currently 3.125 BTC)
  - Current timestamp requirements

### 2. Build the Coinbase Transaction
- Create a special "coinbase" transaction that pays the mining reward to yourself
- This transaction has no inputs (it creates new Bitcoin)
- Output goes to your Bitcoin address
- Include any transaction fees from other transactions

### 3. Calculate Merkle Root
- Take all transactions (including your coinbase transaction)
- Build a "merkle tree" - a mathematical structure that creates a single hash representing all transactions
- This ensures no one can change the transactions without changing the merkle root

### 4. Construct Block Header
- Build an 80-byte data structure containing:
  - **Version**: Protocol version number
  - **Previous Hash**: Hash of the previous block (32 bytes)
  - **Merkle Root**: Hash representing all transactions (32 bytes)
  - **Timestamp**: When this block was created (4 bytes)
  - **Difficulty Bits**: Current network difficulty target (4 bytes)
  - **Nonce**: Random number you change to find solution (4 bytes)

### 5. Hash the Block Header
- Take the 80-byte block header
- Run it through SHA-256 twice (this is Bitcoin's hash function)
- Result is a 32-byte hash that looks like: `4afccbd7c9d5354030e7bd1682b988ae...`

### 6. Check if Hash Meets Target
- Compare your hash to the network's target difficulty
- Target looks like: `0000000000000000000211ac000000000000000000...`
- Your hash must be **less than** this target (mathematically smaller)
- Currently requires about 19 leading zeros

### 7. If Hash Doesn't Meet Target
- Increment the nonce by 1 (or change timestamp)
- Go back to step 5 and hash again
- Repeat millions/billions of times until you find a winning hash

### 8. If Hash Meets Target - You Win!
- Submit your complete block to the network
- Other nodes verify your work
- If valid, your block gets added to the blockchain
- You receive the coinbase reward (3.125 BTC + transaction fees)

## The Challenge

The network automatically adjusts difficulty every 2,016 blocks (~2 weeks) to maintain 10-minute average block times. Currently:

- **Difficulty**: ~136 trillion
- **Required hashes**: ~584 sextillion attempts on average
- **Network hash rate**: ~800 exahashes per second
- **Your odds**: Essentially zero with consumer hardware

Modern miners use specialized ASIC chips running at 100+ terahashes per second. A JavaScript miner might achieve 1-10 thousand hashes per second.

## What This Implementation Does

Our JavaScript miner demonstrates each step:
1. ✅ Connects to Bitcoin Core RPC
2. ✅ Fetches real block templates
3. ✅ Builds proper 80-byte block headers
4. ✅ Performs double SHA-256 hashing
5. ✅ Validates against network target
6. 🔄 Ready for nonce iteration loop

While it won't find blocks on mainnet, it shows exactly how Bitcoin mining works under the hood.