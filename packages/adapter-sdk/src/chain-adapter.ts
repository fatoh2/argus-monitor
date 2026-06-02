import type {
  NativeBalance,
  TokenBalance,
  Transaction,
  RpcHealthResult,
} from './types';

/**
 * Chain adapter interface — all chain implementations must conform.
 *
 * Implement this interface to add support for a new blockchain.
 * See SolanaAdapter for a reference implementation.
 */
export interface ChainAdapter {
  /** Get native currency balance (SOL/ETH/etc) */
  getNativeBalance(address: string): Promise<NativeBalance>;

  /** Get all token/SPL balances for an address */
  getTokenBalances(address: string): Promise<TokenBalance[]>;

  /** Get recent transactions for an address */
  getRecentTransactions(
    address: string,
    limit?: number,
  ): Promise<Transaction[]>;

  /** Check RPC endpoint health */
  checkRpcHealth(endpoint: string): Promise<RpcHealthResult>;

  /** Get the chain type identifier */
  getChainType(): string;
}
