import { SolanaAdapter } from '../solana.adapter';

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => {
  const mockPublicKey = {
    toBase58: jest.fn().mockReturnValue('MockPublicKeyBase58'),
  };

  const mockConnection = {
    getBalance: jest.fn(),
    getParsedTokenAccountsByOwner: jest.fn(),
    getSignaturesForAddress: jest.fn(),
    getParsedTransactions: jest.fn(),
    getBlockHeight: jest.fn(),
  };

  return {
    Connection: jest.fn().mockImplementation(() => mockConnection),
    PublicKey: jest.fn().mockImplementation((address: string) => {
      if (address === 'invalid') {
        throw new Error('Invalid public key');
      }
      return {
        ...mockPublicKey,
        toBase58: jest.fn().mockReturnValue(address),
      };
    }),
    mockConnection,
  };
});

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;
  let mockConnection: any;

  beforeEach(() => {
    adapter = new SolanaAdapter({
      rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=test-key',
    });
    // Get the mock connection instance
    const { mockConnection: mc } = jest.requireMock('@solana/web3.js');
    mockConnection = mc;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getChainType', () => {
    it('should return solana', () => {
      expect(adapter.getChainType()).toBe('solana');
    });
  });

  describe('getNativeBalance', () => {
    it('should return balance in lamports as bigint', async () => {
      mockConnection.getBalance.mockResolvedValue(5000000000);

      const result = await adapter.getNativeBalance('Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1');

      expect(result.address).toBe('Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1');
      expect(result.balance).toBe(BigInt(5000000000));
      expect(result.decimals).toBe(9);
      expect(result.symbol).toBe('SOL');
      expect(mockConnection.getBalance).toHaveBeenCalledTimes(1);
    });

    it('should throw on invalid address', async () => {
      await expect(adapter.getNativeBalance('invalid')).rejects.toThrow(
        'Invalid Solana address',
      );
    });
  });

  describe('getTokenBalances', () => {
    it('should return token balances', async () => {
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'mint123',
                    tokenAmount: {
                      amount: '1000000',
                      decimals: 6,
                    },
                    tokenSymbol: 'USDC',
                  },
                },
              },
            },
          },
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'mint456',
                    tokenAmount: {
                      amount: '0',
                      decimals: 6,
                    },
                    tokenSymbol: 'ZERO',
                  },
                },
              },
            },
          },
        ],
      });

      const result = await adapter.getTokenBalances('Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1');

      expect(result).toHaveLength(1);
      expect(result[0].mint).toBe('mint123');
      expect(result[0].symbol).toBe('USDC');
      expect(result[0].amount).toBe(BigInt(1000000));
      expect(result[0].decimals).toBe(6);
    });

    it('should return empty array when no token accounts', async () => {
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({
        value: [],
      });

      const result = await adapter.getTokenBalances('Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1');
      expect(result).toEqual([]);
    });
  });

  describe('getRecentTransactions', () => {
    it('should return empty array when no signatures', async () => {
      mockConnection.getSignaturesForAddress.mockResolvedValue([]);

      const result = await adapter.getRecentTransactions(
        'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
      );

      expect(result).toEqual([]);
    });

    it('should return normalized transactions', async () => {
      mockConnection.getSignaturesForAddress.mockResolvedValue([
        { signature: 'sig1' },
        { signature: 'sig2' },
      ]);

      mockConnection.getParsedTransactions.mockResolvedValue([
        {
          slot: 100,
          blockTime: 1700000000,
          meta: {
            fee: 5000,
            err: null,
            preBalances: [1000000000, 0],
            postBalances: [0, 1000000000],
          },
          transaction: {
            message: {
              accountKeys: [
                { pubkey: { toBase58: () => 'sender123' } },
                { pubkey: { toBase58: () => 'receiver456' } },
              ],
            },
          },
        },
        null,
      ]);

      const result = await adapter.getRecentTransactions(
        'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
        5,
      );

      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe('sig1');
      expect(result[0].slot).toBe(100);
      expect(result[0].from).toBe('sender123');
      expect(result[0].to).toBe('receiver456');
      expect(result[0].amount).toBe(BigInt(1000000000));
      expect(result[0].fee).toBe(BigInt(5000));
      expect(result[0].status).toBe('success');
    });
  });

  describe('checkRpcHealth', () => {
    it('should return healthy result', async () => {
      mockConnection.getBlockHeight.mockResolvedValue(250000000);

      const result = await adapter.checkRpcHealth(
        'https://mainnet.helius-rpc.com/?api-key=test-key',
      );

      expect(result.healthy).toBe(true);
      expect(result.blockHeight).toBe(250000000);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy result on error', async () => {
      mockConnection.getBlockHeight.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await adapter.checkRpcHealth(
        'https://bad-rpc.example.com',
      );

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });
});
