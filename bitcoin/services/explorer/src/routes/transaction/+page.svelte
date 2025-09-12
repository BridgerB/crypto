<!-- src/routes/transaction/+page.svelte -->
<script>
	// Form data from server action
	export let form;

	// Flag to check if we have a result
	$: hasResult = form?.transaction && !form?.error;

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
	<title>Bitcoin Transaction Explorer</title>
</svelte:head>

<div class="container">
	<h1>Bitcoin Transaction Explorer</h1>

	<!-- Search Form -->
	<form method="POST" class="search-form">
		<div class="form-group">
			<label for="txid">Transaction ID:</label>
			<input
				type="text"
				id="txid"
				name="txid"
				class="search-input"
				placeholder="Enter transaction ID (txid)"
				value={form?.txid || ''}
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
		<div class="tx-details">
			<h2>Transaction Details</h2>

			<div class="card">
				<h3>Transaction Summary</h3>
				<table class="info-table">
					<tbody>
						<tr>
							<th>Transaction ID:</th>
							<td class="hash">{form.transaction.txid}</td>
						</tr>
						<tr>
							<th>Hash:</th>
							<td class="hash">{form.transaction.hash}</td>
						</tr>
						<tr>
							<th>Block:</th>
							<td>
								{#if form.transaction.blockhash}
									<a href="/block?blockQuery={form.transaction.blockhash}" class="hash">
										{form.transaction.blockhash}
									</a>
								{:else}
									Unconfirmed
								{/if}
							</td>
						</tr>
						<tr>
							<th>Confirmations:</th>
							<td>{form.transaction.confirmations || 0}</td>
						</tr>
						<tr>
							<th>Time:</th>
							<td>{form.transaction.timeFormatted || 'Pending'}</td>
						</tr>
						<tr>
							<th>Size:</th>
							<td>{formatSize(form.transaction.size)} ({form.transaction.size} bytes)</td>
						</tr>
						<tr>
							<th>Virtual Size:</th>
							<td>{form.transaction.vsize} vbytes</td>
						</tr>
						<tr>
							<th>Weight:</th>
							<td>{form.transaction.weight} weight units</td>
						</tr>
						<tr>
							<th>Version:</th>
							<td>{form.transaction.version}</td>
						</tr>
						<tr>
							<th>Lock Time:</th>
							<td>{form.transaction.locktime}</td>
						</tr>
						<tr>
							<th>Total Output:</th>
							<td>₿ {formatBTC(form.transaction.totalOutput)}</td>
						</tr>
						{#if form.transaction.fee !== undefined}
							<tr>
								<th>Fee:</th>
								<td>₿ {formatBTC(form.transaction.fee)}</td>
							</tr>
							<tr>
								<th>Fee Rate:</th>
								<td>{form.transaction.feeRate.toFixed(2)} sat/vB</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>

			<!-- Input Details -->
			<div class="card">
				<h3>Inputs ({form.transaction.vin.length})</h3>

				{#each form.transaction.vin as input, i}
					<div class="input-output-item">
						<div class="input-header">
							<span class="input-index">Input #{i}</span>

							{#if input.isCoinbase}
								<span class="coinbase-badge">Coinbase (Newly Generated Coins)</span>
							{/if}
						</div>

						{#if input.isCoinbase}
							<div class="input-details">
								<table class="input-table">
									<tbody>
										<tr>
											<th>Coinbase:</th>
											<td class="hash">{input.coinbase}</td>
										</tr>
										<tr>
											<th>Sequence:</th>
											<td>{input.sequence}</td>
										</tr>
									</tbody>
								</table>
							</div>
						{:else}
							<div class="input-details">
								<table class="input-table">
									<tbody>
										<tr>
											<th>Previous Transaction:</th>
											<td class="hash">
												<a href="/transaction?txid={input.txid}">{input.txid}</a>
											</td>
										</tr>
										<tr>
											<th>Output Index:</th>
											<td>{input.vout}</td>
										</tr>
										<tr>
											<th>Script Signature:</th>
											<td class="script">
												<div class="script-container">
													{#if input.scriptSig?.asm}
														<div class="script-asm">{input.scriptSig.asm}</div>
													{/if}
													{#if input.scriptSig?.hex}
														<div class="script-hex">{input.scriptSig.hex}</div>
													{/if}
												</div>
											</td>
										</tr>
										<tr>
											<th>Sequence:</th>
											<td>{input.sequence}</td>
										</tr>
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Output Details -->
			<div class="card">
				<h3>Outputs ({form.transaction.vout.length})</h3>

				{#each form.transaction.vout as output}
					<div class="input-output-item">
						<div class="output-header">
							<span class="output-index">Output #{output.n}</span>
							<span class="output-value">Value: ₿ {formatBTC(output.value)}</span>
						</div>

						<div class="output-details">
							<table class="output-table">
								<tbody>
									<tr>
										<th>Type:</th>
										<td>{output.type}</td>
									</tr>
									{#if output.addresses && output.addresses.length > 0}
										<tr>
											<th>{output.addresses.length > 1 ? 'Addresses:' : 'Address:'}</th>
											<td>
												{#each output.addresses as address}
													<div class="address">{address}</div>
												{/each}
											</td>
										</tr>
									{/if}
									<tr>
										<th>Script:</th>
										<td class="script">
											<div class="script-container">
												{#if output.scriptPubKey?.asm}
													<div class="script-asm">{output.scriptPubKey.asm}</div>
												{/if}
												{#if output.scriptPubKey?.hex}
													<div class="script-hex">{output.scriptPubKey.hex}</div>
												{/if}
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				{/each}
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

	.info-table th,
	.input-table th,
	.output-table th {
		text-align: right;
		padding: 10px;
		width: 160px;
		color: #555;
		vertical-align: top;
		border-bottom: 1px solid #eee;
	}

	.info-table td,
	.input-table td,
	.output-table td {
		padding: 10px;
		border-bottom: 1px solid #eee;
		word-break: break-word;
	}

	.hash,
	.script,
	.address {
		font-family: monospace;
		font-size: 0.9em;
		word-break: break-all;
	}

	.input-output-item {
		margin-bottom: 20px;
		border: 1px solid #eee;
		border-radius: 4px;
	}

	.input-header,
	.output-header {
		background-color: #f5f5f5;
		padding: 10px;
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid #eee;
	}

	.input-index,
	.output-index {
		font-weight: bold;
	}

	.output-value {
		color: #2a9d8f;
		font-weight: bold;
	}

	.input-details,
	.output-details {
		padding: 10px;
	}

	.input-table,
	.output-table {
		width: 100%;
		border-collapse: collapse;
	}

	.script-container {
		max-height: 100px;
		overflow-y: auto;
		background-color: #f8f9fa;
		padding: 8px;
		border-radius: 4px;
	}

	.script-asm {
		margin-bottom: 8px;
		white-space: pre-wrap;
	}

	.script-hex {
		color: #6c757d;
		white-space: pre-wrap;
	}

	.coinbase-badge {
		background-color: #28a745;
		color: white;
		padding: 3px 8px;
		border-radius: 4px;
		font-size: 0.8em;
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

		.info-table th,
		.input-table th,
		.output-table th {
			width: 120px;
		}
	}
</style>
