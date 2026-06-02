/**
 * Chain Adapter Interface
 *
 * All chain adapters (Solana, EVM, etc.) implement this interface.
 * Amounts are always returned as BIGINT (lamports/wei), never float.
 */

/**
 * Normalized native balance response.
 */
export interface NativeBalance {
  /** Address queried */
  address: string;
  /** Balance in smallest unit (lamports for Solana, wei for EVM) */
  balance: bigint;
  /** Number of decimals for display conversion */
  decimals: number;
  /** Human-readable symbol */
  symbol: string;
}

/**
 * Normalized token balance response.
 */
export interface TokenBalance {
  /** Token mint/contract address */
  mint: string;
  /** Token symbol if available */
  symbol: string;
  /** Token name if available */
  name: string;
  /** Balance in smallest unit */
  amount: bigint;
  /** Number of decimals for display conversion */
  decimals: number;
  /** USD value if available, null otherwise */
  usdValue: number | null;
}

/**
 * Normalized transaction response.
 */
export interface Transaction {
  /** Transaction signature/hash */
  signature: string;
  /** Block slot/number */
  slot: number;
  /** Unix timestamp (seconds) */
  timestamp: number | null;
  /** Sender address */
  from: string;
  /** Receiver address */
  to: string;
  /** Amount transferred in smallest unit */
  amount: bigint;
  /** Fee in smallest unit */
  fee: bigint;
  /** Transaction status */
  status: 'success' | 'failed';
  /** Type of transaction */
  type: string;
  /** Raw transaction data (optional, for debugging) */
  raw?: unknown;
}

/**
 * RPC health check result.
 */
export interface RpcHealthResult {
  /** RPC endpoint URL */
  endpoint: string;
  /** Whether the RPC is reachable and responding */
  healthy: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Current block height/slot */
  blockHeight: number;
  /** Any error message if unhealthy */
  error?: string;
}

/**
 * Chain adapter interface — all chain implementations must conform.
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
