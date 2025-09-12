<!-- src/routes/blocks/+page.svelte -->
<script>
	// Form data from server action
	export let form;

	// Flag to check if we have a result
	$: hasResult = form?.block && !form?.error;

	// Format value as BTC with 8 decimal places
	function formatBTC(value) {
		if (typeof value !== 'number') return '0.00000000';
		return value.toFixed(8);
	}

	// Format filesize (bytes to KB/MB)
	function formatSize(bytes) {
		if (bytes < 1024) return `${bytes} bytes`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}
</script>

<svelte:head>
	<title>Bitcoin Block Explorer</title>
</svelte:head>

<div class="container">
	<h1>Bitcoin Block Explorer</h1>

	<!-- Search Form -->
	<form method="POST" class="search-form">
		<div class="form-group">
			<label for="blockQuery">Block Hash or Height:</label>
			<input
				type="text"
				id="blockQuery"
				name="blockQuery"
				class="search-input"
				placeholder="Enter block hash or height"
				value={form?.blockQuery || ''}
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
		<div class="block-details">
			<h2>Block #{form.block.height}</h2>

			<div class="card">
				<h3>Block Summary</h3>
				<table class="info-table">
					<tbody>
						<tr>
							<th>Hash:</th>
							<td class="hash">{form.block.hash}</td>
						</tr>
						<tr>
							<th>Previous Block:</th>
							<td class="hash">
								<a href="/block?blockQuery={form.block.previousblockhash}">
									{form.block.previousblockhash}
								</a>
							</td>
						</tr>
						<tr>
							<th>Next Block:</th>
							<td>
								{#if form.block.nextblockhash}
									<a href="/block?blockQuery={form.block.nextblockhash}" class="hash">
										{form.block.nextblockhash}
									</a>
								{:else}
									No next block (latest block in chain)
								{/if}
							</td>
						</tr>
						<tr>
							<th>Merkle Root:</th>
							<td class="hash">{form.block.merkleroot}</td>
						</tr>
						<tr>
							<th>Time:</th>
							<td>{form.block.timeFormatted} (Unix: {form.block.time})</td>
						</tr>
						<tr>
							<th>Confirmations:</th>
							<td>{form.block.confirmations}</td>
						</tr>
						<tr>
							<th>Difficulty:</th>
							<td>{form.block.difficulty.toLocaleString()}</td>
						</tr>
						<tr>
							<th>Bits:</th>
							<td>{form.block.bits}</td>
						</tr>
						<tr>
							<th>Nonce:</th>
							<td>{form.block.nonce}</td>
						</tr>
						<tr>
							<th>Version:</th>
							<td>{form.block.version} (Hex: {form.block.versionHex})</td>
						</tr>
						<tr>
							<th>Size:</th>
							<td>{formatSize(form.block.size)} ({form.block.size.toLocaleString()} bytes)</td>
						</tr>
						<tr>
							<th>Weight:</th>
							<td>{form.block.weight.toLocaleString()} weight units</td>
						</tr>
						<tr>
							<th>Transactions:</th>
							<td>{form.block.stats.totalTransactions}</td>
						</tr>
						<tr>
							<th>Total Value:</th>
							<td>₿ {formatBTC(form.block.stats.totalValue)}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<!-- Transactions Table -->
			<div class="card">
				<h3>Transactions ({form.block.tx.length})</h3>

				<div class="table-container">
					<table class="tx-table">
						<thead>
							<tr>
								<th>#</th>
								<th>Transaction ID</th>
								<th>Size</th>
								<th>Outputs</th>
								<th>Total Value</th>
							</tr>
						</thead>
						<tbody>
							{#each form.block.tx as tx, i}
								{@const txValue = tx.vout.reduce((sum, out) => sum + parseFloat(out.value || 0), 0)}
								<tr>
									<td>{i}</td>
									<td class="hash">
										<a href="/transaction?txid={tx.txid}">{tx.txid}</a>
									</td>
									<td>{tx.size.toLocaleString()} bytes</td>
									<td>{tx.vout.length}</td>
									<td>₿ {formatBTC(txValue)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
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

	.info-table {
		width: 100%;
		border-collapse: collapse;
	}

	.info-table th {
		text-align: right;
		padding: 10px;
		width: 160px;
		color: #555;
		vertical-align: top;
		border-bottom: 1px solid #eee;
	}

	.info-table td {
		padding: 10px;
		border-bottom: 1px solid #eee;
		word-break: break-word;
	}

	.hash {
		font-family: monospace;
		font-size: 0.9em;
		word-break: break-all;
	}

	.table-container {
		overflow-x: auto;
	}

	.tx-table {
		width: 100%;
		border-collapse: collapse;
	}

	.tx-table th {
		background-color: #f5f5f5;
		padding: 10px;
		text-align: left;
		border-bottom: 2px solid #ddd;
	}

	.tx-table td {
		padding: 10px;
		border-bottom: 1px solid #eee;
	}

	.tx-table tr:hover {
		background-color: #f9f9f9;
	}

	a {
		color: #0066cc;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
