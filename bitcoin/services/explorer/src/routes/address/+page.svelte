<!-- src/routes/address/+page.svelte -->
<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	// Form data from server action
	export let form;

	// State for the search input
	let addressQuery = '';

	// Flag to check if we have a result
	$: hasResult = form?.balance && !form?.error;

	// Formatting helpers
	function formatBTC(value) {
		if (typeof value !== 'number') return '0.00000000';
		return value.toFixed(8);
	}

	function formatSats(value) {
		if (typeof value !== 'number') return '0';
		return value.toLocaleString();
	}

	function formatTimestamp(timestamp) {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp * 1000).toLocaleString();
	}

	function shortenTxid(txid) {
		if (!txid) return '';
		return txid.substring(0, 10) + '...' + txid.substring(txid.length - 10);
	}

	// Check URL parameters on mount
	onMount(() => {
		// Get query parameter from URL if it exists
		const urlAddress = $page.url.searchParams.get('address');
		if (urlAddress) {
			addressQuery = urlAddress;

			// Automatically submit the form if address is from URL
			const form = document.getElementById('address-search-form');
			if (form) form.submit();
		}
	});
</script>

<svelte:head>
	<title>Bitcoin Address Explorer</title>
</svelte:head>

<div class="container">
	<h1>Bitcoin Address Explorer</h1>

	<!-- Search Form -->
	<form method="POST" class="search-form" id="address-search-form">
		<div class="form-group">
			<label for="address">Bitcoin Address:</label>
			<input
				type="text"
				id="address"
				name="address"
				class="search-input"
				placeholder="Enter Bitcoin address"
				bind:value={addressQuery}
			/>
			<button type="submit" class="search-button">Search</button>
		</div>

		{#if form?.error}
			<div class="error-message">
				{form.error}
			</div>
		{/if}
	</form>

	<!-- Results Section -->
	{#if hasResult}
		<div class="address-details">
			<h2>Address Information</h2>

			<!-- Balance Card -->
			<div class="card">
				<h3>Balance Summary</h3>
				<div class="address-header">
					<div class="address-hash">{form.address}</div>
				</div>

				<div class="balance-grid">
					<div class="balance-card confirmed">
						<div class="balance-title">Confirmed Balance</div>
						<div class="balance-amount">₿ {formatBTC(form.balance.confirmed.btc)}</div>
						<div class="balance-sats">{formatSats(form.balance.confirmed.satoshis)} satoshis</div>
					</div>

					<div class="balance-card unconfirmed">
						<div class="balance-title">Unconfirmed Balance</div>
						<div class="balance-amount">₿ {formatBTC(form.balance.unconfirmed.btc)}</div>
						<div class="balance-sats">{formatSats(form.balance.unconfirmed.satoshis)} satoshis</div>
					</div>

					<div class="balance-card total">
						<div class="balance-title">Total Balance</div>
						<div class="balance-amount">₿ {formatBTC(form.balance.total.btc)}</div>
						<div class="balance-sats">{formatSats(form.balance.total.satoshis)} satoshis</div>
					</div>
				</div>

				<div class="address-stats">
					<div class="stat-item">
						<div class="stat-label">Transactions</div>
						<div class="stat-value">{form.balance.transactionCount}</div>
					</div>

					<div class="stat-item">
						<div class="stat-label">UTXOs</div>
						<div class="stat-value">{form.utxos.count}</div>
					</div>
				</div>
			</div>

			<!-- Transactions Card -->
			{#if form.transactions && form.transactions.length > 0}
				<div class="card">
					<h3>Transaction History ({form.transactions.length})</h3>

					<div class="table-container">
						<table class="tx-table">
							<thead>
								<tr>
									<th>Transaction ID</th>
									<th>Date</th>
									<th>Block Height</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each form.transactions as tx}
									<tr>
										<td class="hash">
											<a href="/transaction?txid={tx.txid}" title={tx.txid}>
												{shortenTxid(tx.txid)}
											</a>
										</td>
										<td>{tx.date || 'Pending'}</td>
										<td>
											{#if tx.height > 0}
												<a href="/block?blockQuery={tx.height}">{tx.height}</a>
											{:else}
												Unconfirmed
											{/if}
										</td>
										<td>
											<span class={tx.confirmed ? 'status-confirmed' : 'status-pending'}>
												{tx.confirmed ? 'Confirmed' : 'Pending'}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{:else}
				<div class="card">
					<h3>Transaction History</h3>
					<p class="no-data">No transactions found for this address.</p>
				</div>
			{/if}

			<!-- UTXOs Card -->
			{#if form.utxos && form.utxos.utxos && form.utxos.utxos.length > 0}
				<div class="card">
					<h3>Unspent Outputs (UTXOs) ({form.utxos.utxos.length})</h3>

					<div class="table-container">
						<table class="utxo-table">
							<thead>
								<tr>
									<th>Transaction ID</th>
									<th>Output Index</th>
									<th>Value</th>
									<th>Confirmations</th>
								</tr>
							</thead>
							<tbody>
								{#each form.utxos.utxos as utxo}
									<tr>
										<td class="hash">
											<a href="/transaction?txid={utxo.txid}" title={utxo.txid}>
												{shortenTxid(utxo.txid)}
											</a>
										</td>
										<td>{utxo.outputIndex}</td>
										<td>₿ {formatBTC(utxo.valueInBtc)}</td>
										<td>{utxo.height > 0 ? utxo.height : 'Unconfirmed'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<div class="utxo-summary">
						<div class="utxo-total">
							<span>Total UTXO Value:</span>
							<span class="utxo-value">₿ {formatBTC(form.utxos.totalValueBtc)}</span>
							<span class="utxo-sats">({formatSats(form.utxos.totalValueSats)} satoshis)</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="card">
					<h3>Unspent Outputs (UTXOs)</h3>
					<p class="no-data">No unspent outputs found for this address.</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 20px;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	h1 {
		color: #ff9900;
		border-bottom: 2px solid #ff9900;
		padding-bottom: 10px;
		margin-bottom: 20px;
	}

	h2 {
		color: #333;
		margin-top: 30px;
	}

	h3 {
		color: #555;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
		margin-top: 0;
	}

	.search-form {
		margin-bottom: 30px;
		padding: 20px;
		background-color: #f5f5f5;
		border-radius: 5px;
	}

	.form-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	label {
		font-weight: bold;
		min-width: 150px;
	}

	.search-input {
		flex: 1;
		padding: 10px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 16px;
	}

	.search-button {
		background-color: #ff9900;
		color: white;
		border: none;
		padding: 10px 20px;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
	}

	.search-button:hover {
		background-color: #e68a00;
	}

	.error-message {
		color: #d9534f;
		margin-top: 10px;
		padding: 10px;
		background-color: #f8d7da;
		border-radius: 4px;
	}

	.card {
		background-color: white;
		border-radius: 5px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		margin-bottom: 20px;
		padding: 20px;
	}

	.address-header {
		margin-bottom: 20px;
	}

	.address-hash {
		font-family: monospace;
		font-size: 1em;
		word-break: break-all;
		padding: 10px;
		background-color: #f8f9fa;
		border-radius: 4px;
		border: 1px solid #eee;
	}

	.balance-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 15px;
		margin-bottom: 20px;
	}

	.balance-card {
		padding: 15px;
		border-radius: 5px;
		text-align: center;
	}

	.balance-card.confirmed {
		background-color: #e6f7ff;
		border: 1px solid #b3e0ff;
	}

	.balance-card.unconfirmed {
		background-color: #fff7e6;
		border: 1px solid #ffd699;
	}

	.balance-card.total {
		background-color: #f6ffed;
		border: 1px solid #b7eb8f;
	}

	.balance-title {
		font-weight: bold;
		margin-bottom: 10px;
		color: #555;
	}

	.balance-amount {
		font-size: 1.5rem;
		font-weight: bold;
		margin-bottom: 5px;
	}

	.balance-sats {
		color: #777;
		font-size: 0.9rem;
	}

	.address-stats {
		display: flex;
		gap: 20px;
		border-top: 1px solid #eee;
		padding-top: 15px;
	}

	.stat-item {
		flex: 1;
	}

	.stat-label {
		color: #666;
		margin-bottom: 5px;
	}

	.stat-value {
		font-size: 1.2rem;
		font-weight: 500;
	}

	.table-container {
		overflow-x: auto;
	}

	.tx-table,
	.utxo-table {
		width: 100%;
		border-collapse: collapse;
	}

	.tx-table th,
	.utxo-table th {
		background-color: #f5f5f5;
		padding: 10px;
		text-align: left;
		border-bottom: 2px solid #ddd;
	}

	.tx-table td,
	.utxo-table td {
		padding: 10px;
		border-bottom: 1px solid #eee;
	}

	.tx-table tr:hover,
	.utxo-table tr:hover {
		background-color: #f9f9f9;
	}

	.hash {
		font-family: monospace;
		font-size: 0.9em;
		word-break: break-all;
	}

	.status-confirmed {
		color: #28a745;
		font-weight: bold;
	}

	.status-pending {
		color: #ffc107;
		font-weight: bold;
	}

	.utxo-summary {
		margin-top: 15px;
		padding-top: 15px;
		border-top: 1px solid #eee;
		text-align: right;
	}

	.utxo-total {
		font-size: 1.1rem;
	}

	.utxo-value {
		font-weight: bold;
		margin-left: 10px;
	}

	.utxo-sats {
		color: #777;
		font-size: 0.9rem;
		margin-left: 5px;
	}

	.no-data {
		padding: 20px;
		text-align: center;
		color: #777;
		font-style: italic;
	}

	a {
		color: #0066cc;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.form-group {
			flex-direction: column;
			align-items: flex-start;
		}

		.search-input {
			width: 100%;
		}

		.balance-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
