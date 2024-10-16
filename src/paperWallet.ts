import dotenv from 'dotenv';
const fs = require('fs');
const STARTING_BALANCE = process.env.STARTING_BALANCE;

interface PaperWallet {
	solBalance: number;
	tokens: { [mintAddress: string]: { amount: string, decimals: number } };
	transactionHistory: Array<{ type: 'buy' | 'sell', mintAddress: string, amount: number, solAmount: number, date: Date }>;
}

let paperWallet: PaperWallet = {
	solBalance: parseFloat(process.env.STARTING_BALANCE!) || 1000,
	tokens: {},
	transactionHistory: []
};

// Function to simulate a token purchase
function paperWalletBuy(mintAddress: string, amountSol: number, price: number, decimals: number): void {
	const tokenAmount = amountSol / price; // Calculate how many tokens you can buy

	// Update SOL balance
	paperWallet.solBalance -= amountSol;

	// Update token balance
	if (!paperWallet.tokens[mintAddress]) {
		paperWallet.tokens[mintAddress] = { amount: '0', decimals };
	}

	// Add token amount to existing balance
	const currentAmount = BigInt(paperWallet.tokens[mintAddress].amount);
	const newAmount = currentAmount + BigInt(tokenAmount * Math.pow(10, decimals));
	paperWallet.tokens[mintAddress].amount = newAmount.toString();

	// Log the transaction (optional)
	paperWallet.transactionHistory.push({
		type: 'buy',
		mintAddress,
		amount: tokenAmount,
		solAmount: amountSol,
		date: new Date(),
	});

	console.log(`Paper trade: Bought ${tokenAmount} tokens of ${mintAddress} for ${amountSol} SOL.`);
}

// Function to simulate a token sale
function paperWalletSell(mintAddress: string, percentageToSell: number, price: number): { sold: boolean, remainingTokens: number } {
	const tokenBalance = paperWallet.tokens[mintAddress];
	if (!tokenBalance) {
		throw new Error('No tokens available to sell for this mint address.');
	}

	const totalAmount = BigInt(tokenBalance.amount);
	const sellAmount = (totalAmount * BigInt(Math.floor(percentageToSell * 100))) / 10000n;
	const sellAmountFloat = parseFloat(sellAmount.toString()) / Math.pow(10, tokenBalance.decimals);

	// Calculate SOL to receive from the sale
	const solReceived = sellAmountFloat * price;

	// Update SOL balance
	paperWallet.solBalance += solReceived;

	// Update token balance
	const newTokenAmount = totalAmount - sellAmount;
	paperWallet.tokens[mintAddress].amount = newTokenAmount.toString();

	// Log the transaction (optional)
	paperWallet.transactionHistory.push({
		type: 'sell',
		mintAddress,
		amount: sellAmountFloat,
		solAmount: solReceived,
		date: new Date(),
	});

	console.log(`Paper trade: Sold ${sellAmountFloat} tokens of ${mintAddress} for ${solReceived} SOL.`);

	return {
		sold: sellAmount > 0n,
		remainingTokens: parseFloat(newTokenAmount.toString()) / Math.pow(10, tokenBalance.decimals),
	};
}

// Function to get current SOL balance
function getPaperSolBalance(): number {
	return paperWallet.solBalance;
}

// Function to get current token balance for a specific mint address
function getPaperTokenBalance(mintAddress: string): { amount: string, decimals: number } | null {
	return paperWallet.tokens[mintAddress] || null;
}

// Save paper wallet to a JSON file
function savePaperWalletToFile() {
	fs.writeFileSync('paper_wallet.json', JSON.stringify(paperWallet, null, 2));
}

// Load paper wallet from a JSON file
function loadPaperWalletFromFile() {
	if (fs.existsSync('paper_wallet.json')) {
		paperWallet = JSON.parse(fs.readFileSync('paper_wallet.json').toString());
	}
}
export {
	paperWallet,
	paperWalletSell,
	paperWalletBuy,
	savePaperWalletToFile,
	loadPaperWalletFromFile
};
