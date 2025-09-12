<!-- src/routes/+page.svelte -->
<script>
	import { onMount } from 'svelte';

	// State for latest block info
	let latestBlock = null;
	let loading = true;
	let error = null;

	// Search form values
	let blockQuery = '';
	let txid = '';
	let addressQuery = '';

	// Format value as BTC with 8 decimal places
	function formatBTC(value) {
		if (typeof value !== 'number') return '0.00000000';
		return value.toFixed(8);
	}

	// Format timestamp to date string
	function formatTimestamp(timestamp) {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp * 1000).toLocaleString();
	}

	// Function to fetch latest block data
	async function fetchLatestBlock() {
		try {
			loading = true;

			// This would normally be an API call to your backend
			// For this example, we're simulating a response
			// In a real implementation, you'd call your RPC service

			// Simulate network delay for demo purposes
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Sample data structure - in production this would come from your Bitcoin RPC
			latestBlock = {
				height: 800000, // Simulated block height
				hash: '00000000000000000000a7c42a94e584e43ac605a2b9b5f69a8f186a5adebd6a',
				time: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
				txcount: 2500,
				size: 1253692,
				weight: 3993175,
				difficulty: 66469933001481
			};

			error = null;
		} catch (err) {
			console.error('Error fetching latest block:', err);
			error = 'Failed to load latest block data. Please try again later.';
			latestBlock = null;
		} finally {
			loading = false;
		}
	}

	// Fetch data when the component mounts
	onMount(() => {
		fetchLatestBlock();
	});

	// Handle form submissions
	function handleBlockSearch() {
		if (!blockQuery) return;
		window.location.href = `/block?blockQuery=${encodeURIComponent(blockQuery)}`;
	}

	function handleTxSearch() {
		if (!txid) return;
		window.location.href = `/transaction?txid=${encodeURIComponent(txid)}`;
	}

	function handleAddressSearch() {
		if (!addressQuery) return;
		window.location.href = `/address?address=${encodeURIComponent(addressQuery)}`;
	}
</script>

<svelte:head>
	<title>Bitcoin Explorer</title>
</svelte:head>

<div class="container">
	<header>
		<h1>Bitcoin Blockchain Explorer</h1>
		<p class="subtitle">Explore the Bitcoin blockchain using this simple explorer</p>
	</header>

	<div class="search-section">
		<div class="search-card">
			<h2>Search Blockchain</h2>

			<div class="search-forms">
				<div class="search-form-container">
					<h3>Find Block</h3>
					<div class="search-input-group">
						<input
							type="text"
							bind:value={blockQuery}
							placeholder="Block height or hash"
							class="search-input"
						/>
						<button on:click={handleBlockSearch} class="search-button"> Search Block </button>
					</div>
				</div>

				<div class="search-form-container">
					<h3>Find Transaction</h3>
					<div class="search-input-group">
						<input
							type="text"
							bind:value={txid}
							placeholder="Transaction ID (txid)"
							class="search-input"
						/>
						<button on:click={handleTxSearch} class="search-button"> Search Transaction </button>
					</div>
				</div>

				<div class="search-form-container">
					<h3>Find Address</h3>
					<div class="search-input-group">
						<input
							type="text"
							id="addressQuery"
							bind:value={addressQuery}
							placeholder="Bitcoin address"
							class="search-input"
						/>
						<button on:click={handleAddressSearch} class="search-button"> Search Address </button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="latest-block-section">
		<div class="card">
			<h2>Latest Block Information</h2>

			{#if loading}
				<div class="loading">Loading latest block data...</div>
			{:else if error}
				<div class="error-message">{error}</div>
			{:else if latestBlock}
				<div class="latest-block-info">
					<div class="block-header">
						<div class="block-title">
							<span class="block-height">Block #{latestBlock.height}</span>
							<span class="block-time">{formatTimestamp(latestBlock.time)}</span>
						</div>
						<a href={`/block?blockQuery=${latestBlock.height}`} class="view-details-link"
							>View Details</a
						>
					</div>

					<div class="block-stats">
						<div class="stat-item">
							<div class="stat-label">Block Hash</div>
							<div class="stat-value hash">{latestBlock.hash}</div>
						</div>

						<div class="stats-row">
							<div class="stat-item">
								<div class="stat-label">Transactions</div>
								<div class="stat-value">{latestBlock.txcount.toLocaleString()}</div>
							</div>

							<div class="stat-item">
								<div class="stat-label">Size</div>
								<div class="stat-value">{(latestBlock.size / 1024 / 1024).toFixed(2)} MB</div>
							</div>

							<div class="stat-item">
								<div class="stat-label">Weight</div>
								<div class="stat-value">{(latestBlock.weight / 1000).toFixed(1)} kWU</div>
							</div>
						</div>

						<div class="stats-row">
							<div class="stat-item">
								<div class="stat-label">Difficulty</div>
								<div class="stat-value">
									{(latestBlock.difficulty / 1000000000000).toFixed(2)} T
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="features-section">
		<h2>Explorer Features</h2>

		<div class="features-grid">
			<div class="feature-card">
				<h3>Block Explorer</h3>
				<p>
					View detailed information about any block in the Bitcoin blockchain. See block headers,
					transaction lists, and more.
				</p>
				<a href="/block" class="feature-link">Explore Blocks</a>
			</div>

			<div class="feature-card">
				<h3>Transaction Explorer</h3>
				<p>
					Analyze Bitcoin transactions in detail. See inputs, outputs, fee information, and
					associated addresses.
				</p>
				<a href="/transaction" class="feature-link">Explore Transactions</a>
			</div>

			<div class="feature-card">
				<h3>Address Lookup</h3>
				<p>
					Check the balance and transaction history of any Bitcoin address. Track funds across the
					blockchain.
				</p>
				<a href="/address" class="feature-link">Explore Addresses</a>
			</div>

			<div class="feature-card">
				<h3>API Access (Coming Soon)</h3>
				<p>
					Programmatic access to all explorer data. Build your own Bitcoin-powered applications.
				</p>
				<button class="feature-link disabled">Coming Soon</button>
			</div>
		</div>
	</div>

	<footer>
		<p>Bitcoin Explorer - Built with SvelteKit - © 2025</p>
		<p>Powered by Bitcoin Core RPC</p>
	</footer>
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

	header {
		text-align: center;
		margin-bottom: 40px;
		padding-bottom: 20px;
		border-bottom: 2px solid #ff9900;
	}

	h1 {
		color: #ff9900;
		font-size: 2.5rem;
		margin-bottom: 10px;
	}

	.subtitle {
		color: #666;
		font-size: 1.2rem;
	}

	h2 {
		color: #333;
		margin-bottom: 20px;
	}

	h3 {
		color: #555;
		margin-bottom: 15px;
	}

	.search-section {
		margin-bottom: 40px;
	}

	.search-card {
		background-color: #f9f9f9;
		padding: 20px;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
	}

	.search-forms {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.search-form-container {
		flex: 1;
		min-width: 300px;
	}

	.search-input-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.search-input {
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 16px;
	}

	.search-button {
		background-color: #ff9900;
		color: white;
		border: none;
		padding: 12px;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		transition: background-color 0.2s;
	}

	.search-button:hover {
		background-color: #e68a00;
	}

	.card {
		background-color: white;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
		padding: 20px;
		margin-bottom: 30px;
	}

	.loading {
		text-align: center;
		padding: 20px;
		color: #666;
	}

	.error-message {
		color: #d9534f;
		padding: 15px;
		background-color: #f8d7da;
		border-radius: 4px;
		margin-top: 15px;
	}

	.latest-block-info {
		margin-top: 15px;
	}

	.block-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 15px;
		border-bottom: 1px solid #eee;
		margin-bottom: 15px;
	}

	.block-height {
		font-size: 1.3rem;
		font-weight: bold;
		margin-right: 15px;
	}

	.block-time {
		color: #666;
	}

	.view-details-link {
		color: #0066cc;
		text-decoration: none;
		font-weight: bold;
	}

	.view-details-link:hover {
		text-decoration: underline;
	}

	.block-stats {
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	.stats-row {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.stat-item {
		flex: 1;
		min-width: 200px;
	}

	.stat-label {
		color: #666;
		margin-bottom: 5px;
		font-size: 0.9rem;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 500;
	}

	.hash {
		font-family: monospace;
		font-size: 0.9em;
		word-break: break-all;
		background-color: #f5f5f5;
		padding: 8px;
		border-radius: 4px;
	}

	.features-section {
		margin-bottom: 40px;
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 20px;
	}

	.feature-card {
		background-color: white;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
		padding: 20px;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.feature-card h3 {
		color: #333;
		margin-bottom: 10px;
	}

	.feature-card p {
		color: #666;
		margin-bottom: 20px;
		flex-grow: 1;
	}

	.feature-link {
		display: inline-block;
		background-color: #ff9900;
		color: white;
		text-decoration: none;
		padding: 10px 15px;
		border-radius: 4px;
		font-weight: bold;
		text-align: center;
		border: none;
		cursor: pointer;
	}

	.feature-link:hover {
		background-color: #e68a00;
	}

	.feature-link.disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}

	footer {
		text-align: center;
		margin-top: 40px;
		padding-top: 20px;
		border-top: 1px solid #eee;
		color: #666;
	}

	@media (max-width: 768px) {
		.search-forms {
			flex-direction: column;
		}

		.features-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
