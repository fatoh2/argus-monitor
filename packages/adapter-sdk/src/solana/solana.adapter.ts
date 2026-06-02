import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  TransactionSignature,
} from '@solana/web3.js';
import type {
  ChainAdapter,
  NativeBalance,
  TokenBalance,
  Transaction,
  RpcHealthResult,
} from '..';

/**
 * Solana chain adapter — reference implementation of ChainAdapter.
 *
 * Uses Helius RPC by default. Can be configured with any Solana RPC endpoint.
 * All amounts are returned as BIGINT (lamports), never float.
 *
 * @example
 * ```typescript
 * const adapter = new SolanaAdapter({
 *   rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
 * });
 * const balance = await adapter.getNativeBalance('Gg7UjK8...');
 * console.log(`Balance: ${balance.balance} lamports`);
 * ```
 */
export class SolanaAdapter implements ChainAdapter {
  private readonly connection: Connection;
  private readonly rpcUrl: string;

  constructor(options: { rpcUrl: string }) {
    this.rpcUrl = options.rpcUrl;
    this.connection = new Connection(this.rpcUrl, {
      commitment: 'confirmed',
    });
  }

  getChainType(): string {
    return 'solana';
  }

  /**
   * Get native SOL balance for an address.
   * Returns balance in lamports (BIGINT).
   */
  async getNativeBalance(address: string): Promise<NativeBalance> {
    const publicKey = this.validateAddress(address);
    const lamports = await this.connection.getBalance(publicKey);

    return {
      address,
      balance: BigInt(lamports),
      decimals: 9,
      symbol: 'SOL',
    };
  }

  /**
   * Get all SPL token balances for an address.
   */
  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    const publicKey = this.validateAddress(address);

    const tokenAccounts =
      await this.connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey(
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        ),
      });

    const balances: TokenBalance[] = [];

    for (const { account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      const tokenAmount = parsedInfo.tokenAmount;

      // Skip zero-balance tokens
      if (tokenAmount.amount === '0') {
        continue;
      }

      balances.push({
        mint: parsedInfo.mint,
        symbol: parsedInfo.tokenSymbol || '',
        name: '',
        amount: BigInt(tokenAmount.amount),
        decimals: tokenAmount.decimals,
        usdValue: null,
      });
    }

    return balances;
  }

  /**
   * Get recent transactions for an address.
   * Returns last `limit` transactions normalized.
   */
  async getRecentTransactions(
    address: string,
    limit: number = 20,
  ): Promise<Transaction[]> {
    const publicKey = this.validateAddress(address);

    const signatures = await this.connection.getSignaturesForAddress(
      publicKey,
      { limit },
    );

    if (signatures.length === 0) {
      return [];
    }

    const txSignatures: TransactionSignature[] = signatures.map(
      (s) => s.signature,
    );

    const transactions = await this.connection.getParsedTransactions(
      txSignatures,
      {
        maxSupportedTransactionVersion: 0,
      },
    );

    const result: Transaction[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const sig = signatures[i];

      if (!tx || !tx.meta) {
        continue;
      }

      const normalized = this.normalizeTransaction(
        tx,
        sig.signature,
        address,
      );
      if (normalized) {
        result.push(normalized);
      }
    }

    return result;
  }

  /**
   * Check RPC endpoint health.
   */
  async checkRpcHealth(endpoint: string): Promise<RpcHealthResult> {
    const start = Date.now();
    const connection = new Connection(endpoint, {
      commitment: 'confirmed',
    });

    try {
      const blockHeight = await connection.getBlockHeight();
      const latencyMs = Date.now() - start;

      return {
        endpoint,
        healthy: true,
        latencyMs,
        blockHeight,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return {
        endpoint,
        healthy: false,
        latencyMs,
        blockHeight: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate a Solana address string.
   * @throws If the address is not a valid Solana public key.
   */
  private validateAddress(address: string): PublicKey {
    try {
      return new PublicKey(address);
    } catch {
      throw new Error(`Invalid Solana address: ${address}`);
    }
  }

  /**
   * Normalize a parsed Solana transaction into the standard Transaction type.
   */
  private normalizeTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string,
    _address: string,
  ): Transaction | null {
    const meta = tx.meta;
    if (!meta) return null;

    const accountKeys = tx.transaction.message.accountKeys;
    const postBalances = meta.postBalances;
    const preBalances = meta.preBalances;

    // Find the first account with a balance change
    let from = '';
    let to = '';
    let amount = BigInt(0);

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys[i].pubkey.toBase58();
      const pre = preBalances[i] || 0;
      const post = postBalances[i] || 0;

      if (post < pre) {
        from = key;
        amount = BigInt(pre - post);
      } else if (post > pre && !to) {
        to = key;
      }
    }

    const fee = BigInt(meta.fee || 0);
    const err = meta.err;
    const status: 'success' | 'failed' = err ? 'failed' : 'success';
    const timestamp = tx.blockTime || null;

    return {
      signature,
      slot: tx.slot,
      timestamp,
      from,
      to,
      amount,
      fee,
      status,
      type: 'transfer',
    };
  }
}
