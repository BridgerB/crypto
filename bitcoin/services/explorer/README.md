# Bitcoin Core Setup

This README explains how to set up and run Bitcoin Core with the provided
configuration file.

## Prerequisites

- Bitcoin Core installed on your system
- Sufficient disk space at the specified location

## Setup

1. Make sure your external drive is mounted at `/run/media/bridger/6TB/`

2. Create the necessary directories:

   ```bash
   mkdir -p /run/media/bridger/6TB/git/bitcoin/data/bitcoin-core-data
   ```

3. Place the `bitcoin.conf` file in the bitcoin directory:

   ```bash
   # The file should be at:
   # /run/media/bridger/6TB/git/bitcoin/bitcoin.conf
   ```

4. **IMPORTANT**: Edit the configuration file to change the default RPC
   password:
   ```bash
   nano /run/media/bridger/6TB/git/bitcoin/bitcoin.conf
   ```
   Replace `CHANGE_THIS_TO_A_UNIQUE_PASSWORD` with a secure password.

## Starting Bitcoin Core

To start Bitcoin Core with this configuration:

```bash
bitcoind -conf=/run/media/bridger/6TB/git/bitcoin/bitcoin.conf
```

This will start Bitcoin Core as a daemon (background process) using your
configuration.

## Verifying the Setup

To verify Bitcoin Core is running:

```bash
bitcoin-cli -conf=/run/media/bridger/6TB/git/bitcoin/bitcoin.conf getblockchaininfo
```

## Monitoring the Blockchain Download

To check the blockchain download progress:

```bash
bitcoin-cli -conf=/run/media/bridger/6TB/git/bitcoin/bitcoin.conf getblockchaininfo
```

## Stopping Bitcoin Core

To properly shut down Bitcoin Core:

```bash
bitcoin-cli -conf=/run/media/bridger/6TB/git/bitcoin/bitcoin.conf stop
```

## Verifying Data Files

After the blockchain begins downloading, you can verify the format of the
blockchain files:

```bash
hexdump -C -n 16 /run/media/bridger/6TB/git/bitcoin/data/bitcoin-core-data/blocks/blk00000.dat
```

The output should begin with `F9 BE B4 D9`, which are the Bitcoin magic bytes.

---

## View genesis block:

```
bitcoin-cli getblock $(bitcoin-cli getblockhash 0) 0 | xxd -r -p | hexdump -C | grep -A3 -B1 "Times"
```
