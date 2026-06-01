import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  TransactionSignature,
} from '@solana/web3.js';
import {
  ChainAdapter,
  NativeBalance,
  TokenBalance,
  Transaction,
  RpcHealthResult,
} from '@argus/shared-types';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

/**
 * Solana chain adapter using Helius RPC.
 * Implements the ChainAdapter interface for Solana blockchain.
 */
@Injectable()
export class SolanaAdapter implements ChainAdapter {
  private readonly logger = new Logger(SolanaAdapter.name);
  private connection: Connection;
  private readonly heliusApiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimiter: RateLimiterService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.heliusApiKey = this.configService.get<string>('helius.apiKey', '');
    const rpcUrl = this.configService.get<string>(
      'helius.rpcUrl',
      `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`,
    );
    this.connection = new Connection(rpcUrl, {
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

    const balance = await this.circuitBreaker.execute(async () => {
      return this.rateLimiter.execute(async () => {
        const lamports = await this.connection.getBalance(publicKey);
        return lamports;
      });
    });

    return {
      address,
      balance: BigInt(balance),
      decimals: 9,
      symbol: 'SOL',
    };
  }

  /**
   * Get all SPL token balances for an address.
   */
  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    const publicKey = this.validateAddress(address);

    const tokenAccounts = await this.circuitBreaker.execute(async () => {
      return this.rateLimiter.execute(async () => {
        return this.connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: new PublicKey(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ),
        });
      });
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
        name: '', // Helius parsed data doesn't always include name
        amount: BigInt(tokenAmount.amount),
        decimals: tokenAmount.decimals,
        usdValue: null, // Would need price oracle for this
      });
    }

    return balances;
  }

  /**
   * Get recent transactions for an address.
   * Returns last 20 transactions normalized.
   */
  async getRecentTransactions(
    address: string,
    limit: number = 20,
  ): Promise<Transaction[]> {
    const publicKey = this.validateAddress(address);

    const signatures = await this.circuitBreaker.execute(async () => {
      return this.rateLimiter.execute(async () => {
        return this.connection.getSignaturesForAddress(publicKey, {
          limit,
        });
      });
    });

    if (signatures.length === 0) {
      return [];
    }

    // Fetch full transaction data for each signature
    const txSignatures: TransactionSignature[] = signatures.map(
      (s) => s.signature,
    );

    const transactions = await this.circuitBreaker.execute(async () => {
      return this.rateLimiter.execute(async () => {
        return this.connection.getParsedTransactions(txSignatures, {
          maxSupportedTransactionVersion: 0,
        });
      });
    });

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
    const startTime = Date.now();

    try {
      const testConnection = new Connection(endpoint, {
        commitment: 'confirmed',
      });

      const blockHeight = await this.rateLimiter.execute(async () => {
        return testConnection.getBlockHeight();
      });

      const latencyMs = Date.now() - startTime;

      return {
        endpoint,
        healthy: true,
        latencyMs,
        blockHeight,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        endpoint,
        healthy: false,
        latencyMs,
        blockHeight: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate a Solana address string.
   */
  private validateAddress(address: string): PublicKey {
    try {
      return new PublicKey(address);
    } catch {
      throw new Error(`Invalid Solana address: ${address}`);
    }
  }

  /**
   * Normalize a parsed Solana transaction to our Transaction interface.
   */
  private normalizeTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string,
    ourAddress: string,
  ): Transaction | null {
    if (!tx.meta) return null;

    const { meta, transaction, slot, blockTime } = tx;

    // Determine if this was a success or failure
    const status = meta.err === null ? 'success' : 'failed';

    // Calculate fee
    const fee = BigInt(meta.fee);

    // Try to extract transfer info from instructions
    const { from, to, amount, type } = this.extractTransferInfo(
      transaction,
      ourAddress,
    );

    return {
      signature,
      slot,
      timestamp: blockTime || null,
      from,
      to,
      amount,
      fee,
      status,
      type,
    };
  }

  /**
   * Extract transfer information from transaction instructions.
   */
  private extractTransferInfo(
    transaction: any,
    ourAddress: string,
  ): { from: string; to: string; amount: bigint; type: string } {
    const message = transaction.message;

    // Default values
    let from = '';
    let to = '';
    let amount = BigInt(0);
    let type = 'unknown';

    // Check for system program transfers (SOL transfers)
    if (message.instructions && message.instructions.length > 0) {
      for (const ix of message.instructions) {
        const programId = ix.programId?.toString() || '';

        // System Program (11111111111111111111111111111111) — SOL transfer
        if (
          programId === '11111111111111111111111111111111' &&
          ix.parsed?.type === 'transfer'
        ) {
          const info = ix.parsed.info;
          from = info.source || '';
          to = info.destination || '';
          amount = BigInt(info.lamports || 0);
          type = 'sol_transfer';
          break;
        }

        // Token Program (Tokenkeg...) — SPL token transfer
        if (
          programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
          ix.parsed?.type === 'transfer'
        ) {
          const info = ix.parsed.info;
          from = info.source || '';
          to = info.destination || '';
          amount = BigInt(info.amount || 0);
          type = 'spl_transfer';
          break;
        }
      }
    }

    // Fallback: use account keys if we couldn't parse instructions
    if (!from && message.accountKeys && message.accountKeys.length >= 2) {
      from = message.accountKeys[0]?.pubkey?.toString() || '';
      to = message.accountKeys[1]?.pubkey?.toString() || '';
    }

    return { from, to, amount, type };
  }
}
