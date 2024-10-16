import fs from 'fs';
import bs58 from 'bs58';
import path from 'path';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import dotenv from 'dotenv';
import logger from './logger';
import { PaperWalletSell } from './paperWallet';
import { getPriceAndMarketCap } from './PandM';
dotenv.config();

const SLIPPAGE_BASIS_POINTS = 2000n;
const RPC_URL = process.env.HELIUS_RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const PAPER_TRADE = process.env.PAPER_TRADE;

if (!RPC_URL) {
  throw new Error('Please set HELIUS_RPC_URL in .env file');
}

if (!PRIVATE_KEY) {
  throw new Error('Please set PRIVATE_KEY in .env file');
}

const getProvider = (wallet: Wallet): AnchorProvider => {
  const connection = new Connection(RPC_URL, 'confirmed');
  return new AnchorProvider(connection, wallet, { commitment: 'finalized' });
};

interface Asset {
  tokenAddress: string;
  boughtPrice: number;
  boughtMarketCap: number;
  remainingTokens: number | null;
}

const updateAssetsFile = (updatedAssets: Asset[]): void => {
  const filePath = path.join(__dirname, 'assets.txt');
  const data = updatedAssets.map(a => {
    return `${a.tokenAddress}, ${a.boughtPrice.toFixed(9)}, ${a.boughtMarketCap.toFixed(9)}, ${a.remainingTokens != null ? a.remainingTokens.toFixed(6) : ''}`;
  }).join('\n');

  fs.writeFileSync(filePath, data, 'utf8');
};

const sellToken = async (mintAddress: PublicKey, percentageToSell: number): Promise<{ sold: boolean, remainingTokens: number }> => {
  try {

    if (PAPER_TRADE) {
      const priceData = await getPriceAndMarketCap(mintAddress.toBase58());
      if (!priceData) {
        throw new Error('Failed to fetch price and market cap data for selling.');
      }

      const { price } = priceData;
      const result = PaperWalletSell(mintAddress.toBase58(), percentageToSell, price);

      return { sold: result.sold, remainingTokens: result.remainingTokens };
    }

    const privateKey = bs58.decode(process.env.PRIVATE_KEY!);
    const seller = Keypair.fromSecretKey(privateKey);
    const provider = getProvider(new Wallet(seller));
    const sdk = new PumpFunSDK(provider);

    let accountInfo = await sdk.connection.getParsedTokenAccountsByOwner(seller.publicKey, { mint: mintAddress });
    if (accountInfo.value.length === 0) {
      throw new Error('Token account not found for the provided mint address.');
    }

    const tokenAccount = accountInfo.value[0];
    const tokenAmount = BigInt(tokenAccount.account.data.parsed.info.tokenAmount.amount);
    const sellAmount = (tokenAmount * BigInt(Math.floor(percentageToSell * 100))) / 10000n;

    await sdk.sell(
      seller,
      mintAddress,
      sellAmount,
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 250000,
        unitPrice: 250000,
      },
      'confirmed',
      'finalized'
    );

    await new Promise(resolve => setTimeout(resolve, 5000));

    accountInfo = await sdk.connection.getParsedTokenAccountsByOwner(seller.publicKey, { mint: mintAddress });
    const finalBalanceAmount = accountInfo.value.length ? BigInt(accountInfo.value[0].account.data.parsed.info.tokenAmount.amount) : 0n;

    const remainingTokens = parseFloat(finalBalanceAmount.toString()) / Math.pow(10, accountInfo.value[0].account.data.parsed.info.tokenAmount.decimals);

    logger.info(`Sell successful.`);
    return { sold: finalBalanceAmount < tokenAmount, remainingTokens };
  } catch (error) {
    logger.error('Failed to sell tokens:', error);
    return { sold: false, remainingTokens: 0 };
  }
};

export { sellToken, updateAssetsFile };
