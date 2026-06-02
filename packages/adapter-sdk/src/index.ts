/**
 * @argus/adapter-sdk
 *
 * Chain adapter interface and types for blockchain monitoring.
 * Use this package to build chain adapters for Solana, EVM, and beyond.
 */

export { ChainAdapter } from './chain-adapter';
export { SolanaAdapter } from './solana/solana.adapter';
export type {
  NativeBalance,
  TokenBalance,
  Transaction,
  RpcHealthResult,
} from './types';
