// src/routes/+page.server.js
import RPC from "$lib/server/models/rpc.js";

/**
 * Server-side logic for the block page
 * This handles the form submission for block search
 */
export const actions = {
  /**
   * Handle block search form submission
   * @param {Object} event - The request event containing form data
   */
  default: async ({ request }) => {
    const formData = await request.formData();
    const blockQuery = formData.get("blockQuery")?.trim();

    // If no query was provided, return early
    if (!blockQuery) {
      return {
        error: "Please enter a block hash or height",
      };
    }

    const rpc = new RPC();

    try {
      let blockHash;

      // Check if the query is a block height or hash
      if (/^\d+$/.test(blockQuery)) {
        // It's a number, so treat as block height
        blockHash = await rpc.getBlockHash(parseInt(blockQuery));
      } else {
        // Assume it's a block hash
        blockHash = blockQuery;
      }

      // Get block data with full transaction info (verbosity 2)
      const block = await rpc.getBlock(blockHash, 2);

      // Format the timestamp
      block.timeFormatted = new Date(block.time * 1000).toLocaleString();

      // Calculate total transaction value
      let totalValue = 0;
      block.tx.forEach((tx) => {
        tx.vout.forEach((output) => {
          totalValue += parseFloat(output.value) || 0;
        });
      });

      // Add additional statistics
      block.stats = {
        totalTransactions: block.tx.length,
        totalValue,
        avgTransactionSize: block.size / block.tx.length,
        totalFees: block.tx.length > 1
          ? "Calculation requires previous transactions"
          : 0,
      };

      return {
        block,
        success: true,
      };
    } catch (error) {
      console.error("Error fetching block:", error);

      return {
        error: `Unable to find block with ${
          isNaN(blockQuery) ? "hash" : "height"
        } "${blockQuery}". ${error.message}`,
      };
    }
  },
};
