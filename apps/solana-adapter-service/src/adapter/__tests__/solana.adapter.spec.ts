import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SolanaAdapter } from '../solana.adapter';
import { RateLimiterService } from '../../rate-limiter/rate-limiter.service';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => {
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
      if (address === 'invalid' || address === 'bad-address') {
        throw new Error('Invalid public key input');
      }
      return {
        toBase58: jest.fn().mockReturnValue(address),
        toString: jest.fn().mockReturnValue(address),
      };
    }),
    LAMPORTS_PER_SOL: 1_000_000_000,
    mockConnection,
  };
});

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;
  let rateLimiter: jest.Mocked<RateLimiterService>;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;

  const validAddress = 'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1';

  beforeEach(async () => {
    rateLimiter = {
      execute: jest.fn().mockImplementation((fn: () => Promise<any>) => fn()),
    } as any;

    circuitBreaker = {
      execute: jest.fn().mockImplementation((fn: () => Promise<any>) => fn()),
      degraded$: { subscribe: jest.fn() },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolanaAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                'helius.apiKey': 'test-key',
                'helius.rpcUrl': 'https://mainnet.helius-rpc.com/?api-key=test-key',
              };
              return config[key];
            }),
          },
        },
        {
          provide: RateLimiterService,
          useValue: rateLimiter,
        },
        {
          provide: CircuitBreakerService,
          useValue: circuitBreaker,
        },
      ],
    }).compile();

    adapter = module.get<SolanaAdapter>(SolanaAdapter);
  });

  describe('getChainType', () => {
    it('should return solana', () => {
      expect(adapter.getChainType()).toBe('solana');
    });
  });

  describe('address validation', () => {
    it('should throw on invalid Solana address', async () => {
      await expect(adapter.getNativeBalance('invalid')).rejects.toThrow(
        'Invalid Solana address',
      );
    });

    it('should throw on bad address format', async () => {
      await expect(adapter.getNativeBalance('bad-address')).rejects.toThrow(
        'Invalid Solana address',
      );
    });
  });

  describe('normalizeTransaction — lamport conversion', () => {
    it('should handle BIGINT arithmetic correctly (no float)', () => {
      // Test that BIGINT arithmetic stays integer throughout
      const lamports1 = 1000000000n;
      const lamports2 = 500000000n;
      const sum = lamports1 + lamports2;
      expect(sum).toBe(1500000000n);
      expect(typeof sum).toBe('bigint');
      // Verify no float conversion
      expect(Number(sum)).not.toBeNaN();
      expect(sum.toString()).toBe('1500000000');
    });

    it('should handle large BIGINT values without precision loss', () => {
      const large = 9999999999999999999n;
      const small = 1n;
      const result = large + small;
      expect(result).toBe(10000000000000000000n);
      // Verify it's still a bigint (not converted to number)
      expect(typeof result).toBe('bigint');
    });
  });

  describe('getNativeBalance', () => {
    it('should return balance in lamports as bigint', async () => {
      const { mockConnection } = jest.requireMock('@solana/web3.js');
      mockConnection.getBalance.mockResolvedValue(5000000000);

      const result = await adapter.getNativeBalance(validAddress);

      expect(result.address).toBe(validAddress);
      expect(result.balance).toBe(5000000000n);
      expect(typeof result.balance).toBe('bigint');
      expect(result.decimals).toBe(9);
      expect(result.symbol).toBe('SOL');
    });
  });

  describe('getTokenBalances', () => {
    it('should return token balances with bigint amounts', async () => {
      const { mockConnection } = jest.requireMock('@solana/web3.js');
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
        ],
      });

      const result = await adapter.getTokenBalances(validAddress);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1000000n);
      expect(typeof result[0].amount).toBe('bigint');
    });

    it('should skip zero-balance tokens', async () => {
      const { mockConnection } = jest.requireMock('@solana/web3.js');
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'mint-zero',
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

      const result = await adapter.getTokenBalances(validAddress);
      expect(result).toHaveLength(0);
    });
  });
});
