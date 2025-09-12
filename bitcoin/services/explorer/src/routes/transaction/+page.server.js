// src/routes/transaction/+page.server.js
import Transaction from "$lib/server/models/transaction.js";

/**
 * Server-side logic for the transaction page
 * This handles the form submission for transaction search
 */
export const actions = {
  /**
   * Handle transaction search form submission
   * @param {Object} event - The request event containing form data
   */
  default: async ({ request }) => {
    const formData = await request.formData();
    const txid = formData.get("txid")?.trim();

    // If no query was provided, return early
    if (!txid) {
      return {
        error: "Please enter a transaction ID",
      };
    }

    try {
      // Create transaction model instance
      const transactionModel = new Transaction();

      // Get transaction data
      const transaction = await transactionModel.getTransaction(txid);

      return {
        transaction,
        success: true,
      };
    } catch (error) {
      console.error("Error fetching transaction:", error);

      return {
        error: `Unable to find transaction with ID "${txid}". ${error.message}`,
      };
    }
  },
};
