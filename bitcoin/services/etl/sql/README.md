# Bitcoin ETL (Extract, Transform, Load)

A high-performance system for extracting and storing Bitcoin blockchain data in
PostgreSQL.

## Overview

This Bitcoin ETL system provides a reliable and efficient way to extract data
from the Bitcoin blockchain and store it in a structured PostgreSQL database for
analysis. It uses parallel processing to optimize throughput and handles all
aspects of the blockchain including blocks, transactions, inputs, and outputs.

## Features

- **Multi-threaded Processing**: Leverages multiple CPU cores for parallel block
  processing
- **Robust Error Handling**: Graceful recovery from connection issues and data
  anomalies
- **Complete Data Model**: Captures all relevant blockchain entities (blocks,
  transactions, inputs, outputs)
- **Transaction Type Detection**: Automatically detects transaction types
  (SegWit, Legacy, Coinbase)
- **Progress Tracking**: Real-time progress monitoring with ETA calculation
- **Docker Support**: Easy database setup with containerized PostgreSQL
- **Optimized SQL Queries**: Pre-built queries for common blockchain analyses

## System Requirements

- **Bitcoin Core Node**: A synchronized Bitcoin node with RPC access
- **PostgreSQL**: Version 12+ recommended
- **Node.js**: Version 16+ recommended
- **Storage**: At least 2TB for a complete blockchain database
- **Memory**: Minimum 8GB RAM, 16GB+ recommended
- **CPU**: Multi-core processor (8+ cores recommended for optimal performance)

## Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/bridgerb/btc-etl.git
   cd btc-etl
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the PostgreSQL database:

   ```bash
   docker-compose up -d
   ```

4. Set environment variables:

   ```bash
   export DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"
   ```

5. Initialize the database schema:

   ```bash
   npm run db:push
   ```

6. Run the ETL process for a range of blocks:
   ```bash
   node run.js 0 1000 --workers 4
   ```

## Database Schema

The database consists of four main tables:

1. **block**: Contains block header information
2. **transaction**: Stores transaction data
3. **input**: Captures transaction inputs
4. **output**: Stores transaction outputs (UTXOs)

See `db/schema.js` for the complete schema definition.

## SQL Files

The `sql` directory contains useful SQL scripts for working with the extracted
blockchain data:

### [common_queries.sql](./sql/common_queries.sql)

Contains frequently used analytical queries, including:

- Blockchain statistics (block counts, transaction counts)
- Transaction type distribution over time
- Address balances and "rich list" generation
- Fee analysis by time period
- Block time statistics

Example usage:

```bash
psql -U root -d local -f sql/common_queries.sql
```

### [create_indexes.sql](./sql/create_indexes.sql)

Creates optimized indexes to improve query performance:

- Primary indexes for all important fields (block height, transaction hashes)
- Composite indexes for common joins
- Partial indexes for specific query types

**Important**: Run this after initial data loading is complete, as indexes slow
down the insertion process.

Example usage:

```bash
psql -U root -d local -f sql/create_indexes.sql
```

### [materialized_views.sql](./sql/materialized_views.sql)

Creates materialized views for complex, commonly-accessed data:

- UTXO set (current unspent outputs)
- Address balances
- Daily blockchain statistics
- Transaction type distribution by block range

Includes functions to refresh these views after new data is loaded.

Example usage:

```bash
psql -U root -d local -f sql/materialized_views.sql
```

## Performance Considerations

- **Block Range**: Processing recent blocks (>600k) will be significantly slower
  than early blocks due to increased transaction complexity
- **Worker Count**: Adjust the `--workers` parameter based on your CPU core
  count and I/O capabilities
- **Database Indexing**: Indexes improve query performance but slow down initial
  data loading
- **RPC Connection**: Ensure your Bitcoin node has sufficient RPC connection
  limits configured
- **Disk I/O**: SSD storage is strongly recommended for the database
- **Materialized Views**: Refresh these periodically after loading new blocks

See `test/time-estimate2.js` for detailed performance benchmarks and estimates.

## Processing Strategy

For a complete blockchain extraction, consider this strategy:

1. Process in 100k block chunks to manage database size and allow for restarts
2. Use more workers for early blocks (0-300k)
3. Reduce worker count for later blocks with higher transaction counts
4. Run `create_indexes.sql` after initial loading
5. Run `materialized_views.sql` for analysis optimization

### Example Processing Script

```bash
# Genesis blocks (fast, use many workers)
node run.js 0 100000 --workers 8

# Early blocks (moderate, use medium worker count)
node run.js 100001 300000 --workers 6

# Middle blocks (slower, reduce worker count)
node run.js 300001 600000 --workers 4

# Recent blocks (slowest, minimize worker count)
node run.js 600001 900000 --workers 2

# Create indexes after loading
psql -U root -d local -f sql/create_indexes.sql

# Create materialized views for analysis
psql -U root -d local -f sql/materialized_views.sql
```

## Extending the ETL

The modular design makes it easy to extend functionality:

- Modify `db/schema.js` to add new tables or fields
- Add new worker logic in `src/worker.js`
- Create additional SQL queries in the `sql` directory
- Customize materialized views for your specific analysis needs

## Common Use Cases

- Creating blockchain explorers
- Address and transaction tracking
- Fee estimation and analysis
- Network activity monitoring
- UTXO set analysis
- Cryptocurrency market research

## Troubleshooting

- **Database Connection Issues**: Verify DATABASE_URL environment variable and
  database container status
- **RPC Connection Failures**: Check Bitcoin node connectivity and credentials
  in `src/rpc.js`
- **Memory Pressure**: Reduce worker count if system memory is exhausted
- **Slow Processing**: Check disk I/O, consider using SSD storage
- **Database Errors**: Run `db/drop-all.js` to reset the database if needed
