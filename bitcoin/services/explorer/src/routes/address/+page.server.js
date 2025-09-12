// src/routes/address/+page.server.js
import Address from "$lib/server/models/address.js";

/**
 * Server-side logic for the address page
 * This handles the form submission for address search
 */
export const actions = {
  /**
   * Handle address search form submission
   * @param {Object} event - The request event containing form data
   */
  default: async ({ request }) => {
    const formData = await request.formData();
    const address = formData.get("address")?.trim();

    // If no query was provided, return early
    if (!address) {
      return {
        error: "Please enter a Bitcoin address",
      };
    }

    try {
      // Create address model instance
      const addressModel = new Address();

      // Get address data - balance and transactions
      const [balance, transactions, utxos] = await Promise.all([
        addressModel.getBalance(address),
        addressModel.getTransactions(address, 50), // Get up to 50 transactions
        addressModel.getUtxos(address),
      ]);

      // Combine results into a single response
      return {
        address,
        balance,
        transactions,
        utxos,
        success: true,
      };
    } catch (error) {
      console.error("Error fetching address data:", error);

      // Check if it's an invalid address error
      if (error.message.includes("Invalid Bitcoin address")) {
        return {
          error: `"${address}" is not a valid Bitcoin address.`,
        };
      }

      // Generic error for other issues
      return {
        error:
          `Unable to fetch data for address "${address}". ${error.message}`,
      };
    }
  },
};
