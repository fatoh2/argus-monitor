import { ChainAdapter } from '../chain-adapter';
import type { NativeBalance, TokenBalance, Transaction, RpcHealthResult } from '../types';

class MockAdapter implements ChainAdapter {
  getChainType(): string {
    return 'mock';
  }

  async getNativeBalance(address: string): Promise<NativeBalance> {
    return {
      address,
      balance: BigInt(1000000000),
      decimals: 9,
      symbol: 'MOCK',
    };
  }

  async getTokenBalances(_address: string): Promise<TokenBalance[]> {
    return [];
  }

  async getRecentTransactions(_address: string, _limit?: number): Promise<Transaction[]> {
    return [];
  }

  async checkRpcHealth(endpoint: string): Promise<RpcHealthResult> {
    return {
      endpoint,
      healthy: true,
      latencyMs: 42,
      blockHeight: 12345,
    };
  }
}

describe('ChainAdapter interface', () => {
  let adapter: ChainAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('should return chain type', () => {
    expect(adapter.getChainType()).toBe('mock');
  });

  it('should return native balance as bigint', async () => {
    const balance = await adapter.getNativeBalance('mock123');
    expect(balance.address).toBe('mock123');
    expect(balance.balance).toBe(BigInt(1000000000));
    expect(typeof balance.balance).toBe('bigint');
    expect(balance.decimals).toBe(9);
    expect(balance.symbol).toBe('MOCK');
  });

  it('should return empty token balances', async () => {
    const tokens = await adapter.getTokenBalances('mock123');
    expect(tokens).toEqual([]);
  });

  it('should return empty transactions', async () => {
    const txs = await adapter.getRecentTransactions('mock123');
    expect(txs).toEqual([]);
  });

  it('should return RPC health', async () => {
    const health = await adapter.checkRpcHealth('https://rpc.example.com');
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBe(42);
    expect(health.blockHeight).toBe(12345);
  });
});
