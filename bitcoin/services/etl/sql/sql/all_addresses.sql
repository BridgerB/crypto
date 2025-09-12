-- sql/all_addresses.sql
-- Query to get all unique Bitcoin addresses that have ever received BTC
-- This will return a very large result set (millions of addresses)

-- Basic query: All unique addresses that have received BTC
SELECT DISTINCT address
FROM output
WHERE address IS NOT NULL;

-- Alternative with additional statistics per address
-- (Comment out the above and uncomment below if you want more details)

/*
SELECT 
    address,
    COUNT(*) as total_outputs,
    MIN(value) as min_received_satoshis,
    MAX(value) as max_received_satoshis,
    SUM(value) as total_received_satoshis,
    SUM(CAST(value AS decimal)) / 100000000.0 as total_received_btc,
    COUNT(DISTINCT tx_hash) as unique_transactions
FROM output
WHERE address IS NOT NULL
GROUP BY address
ORDER BY total_received_satoshis DESC;
*/

-- Alternative with address type breakdown
-- (Uncomment if you want to see distribution by address type)

/*
SELECT 
    address_type,
    COUNT(DISTINCT address) as unique_addresses,
    COUNT(*) as total_outputs,
    SUM(CAST(value AS decimal)) / 100000000.0 as total_btc_received
FROM output
WHERE address IS NOT NULL
GROUP BY address_type
ORDER BY total_btc_received DESC;
*/

-- Simple count of unique addresses (fast query to get total count)
-- (Uncomment to just get the count without listing all addresses)

-- SELECT COUNT(DISTINCT address) as total_unique_addresses
-- FROM output
-- WHERE address IS NOT NULL;