import dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import logger from './logger';
import { getPriceAndMarketCap } from './PandM';
import { writeAssetDetails } from './writeAssets';
import { paperWalletBuy, savePaperWalletToFile } from './paperWallet';

dotenv.config();

const SLIPPAGE_BASIS_POINTS = BigInt(process.env.SLIPPAGE_BASIS_POINTS || '2000');
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || '0.001');
const RPC_URL = process.env.HELIUS_RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const PAPER_TRADE = process.env.PAPER_TRADE || true;
let paperBalance = parseFloat(process.env.STARTING_BALANCE);

if (!PRIVATE_KEY || !PAPER_TRADE) { throw new Error('Please set PRIVATE_KEY in .env file'); }

const getProvider = (wallet: Wallet): AnchorProvider => {
  if (!RPC_URL) {
    throw new Error('Please set HELIUS_RPC_URL in .env file');
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  return new AnchorProvider(connection, wallet, { commitment: 'finalized' });
};

const buyToken = async (mintAddress: string): Promise<{ success: boolean, amount: number }> => {
  try {
    const privateKey = bs58.decode(PRIVATE_KEY);
    const buyerKeypair = Keypair.fromSecretKey(privateKey);
    const wallet = new Wallet(buyerKeypair);
    const provider = getProvider(wallet);
    const sdk = new PumpFunSDK(provider);
    const connection = provider.connection;
    var currentSolBalance = 0.0;

    logger.info('Initializing buy...');

    // Fetch the price and market cap data
    const priceData = await getPriceAndMarketCap(mintAddress);
    if (!priceData) {
      throw new Error('Failed to fetch price and market cap data');
    }
    const { price, marketCap } = priceData;

    // Paper trade mode
    if (PAPER_TRADE) {
      currentSolBalance = paperWallet.solBalance;
      console.log(`Paper trade balance: ${currentSolBalance}`);
    } else {
      currentSolBalance = await connection.getBalance(buyerKeypair.publicKey);
    }

    // Check if SOL balance is sufficient
    if (currentSolBalance < BUY_AMOUNT_SOL * LAMPORTS_PER_SOL + 0.003 * LAMPORTS_PER_SOL) {
      throw new Error(`Insufficient SOL balance. Please fund the buyer account with at least ${(BUY_AMOUNT_SOL + 0.003).toFixed(3)} SOL.`);
    }

    const buyAmountSol = BUY_AMOUNT_SOL * LAMPORTS_PER_SOL;

    // Handle Paper Trade
    if (PAPER_TRADE) {
      console.log('Simulating token purchase...');

      // Use paper wallet to simulate the buy
      paperWalletBuy(mintAddress, buyAmountSol / LAMPORTS_PER_SOL, price, 6); // Assuming 6 decimals for the token

      // Save the updated paper wallet to file
      savePaperWalletToFile();

      const tokenAmount = BUY_AMOUNT_SOL / price;
      console.log(`Simulated purchase: Received ${tokenAmount} tokens for ${BUY_AMOUNT_SOL} SOL.`);
      return { success: true, amount: tokenAmount };
    } else {
      // Actual token purchase logic for real trades
      await sdk.buy(
        buyerKeypair,
        new PublicKey(mintAddress),
        BigInt(buyAmountSol),
        SLIPPAGE_BASIS_POINTS,
        {
          unitLimit: 250000,
          unitPrice: 250000,
        },
        'confirmed',
        'finalized'
      );
    }

    // Wait for the transaction to finalize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Fetch associated token account and verify token balance
    const associatedTokenAccount = await getAssociatedTokenAddress(new PublicKey(mintAddress), buyerKeypair.publicKey);
    const accountInfo = await connection.getParsedAccountInfo(associatedTokenAccount);

    if (accountInfo.value) {
      const data = accountInfo.value.data as any;
      const tokenAmount = parseFloat(data.parsed.info.tokenAmount.amount) / Math.pow(10, data.parsed.info.tokenAmount.decimals);
      if (tokenAmount > 0) {
        writeAssetDetails(mintAddress, price, marketCap, tokenAmount);
        return { success: true, amount: tokenAmount };
      } else {
        logger.info('Purchase failed or zero tokens received.');
      }
    } else {
      logger.info('Associated token account does not exist. Purchase likely failed.');
    }
  } catch (error) {
    logger.error('Error during buying:', error);
  }
  return { success: false, amount: 0 };
};

export {
  buyToken,
};
