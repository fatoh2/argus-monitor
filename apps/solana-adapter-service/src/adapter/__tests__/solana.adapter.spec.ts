import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SolanaAdapter } from '../solana.adapter';
import { RateLimiterService } from '../../rate-limiter/rate-limiter.service';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';

// Mock @argus/shared-types
jest.mock('@argus/shared-types', () => ({}));

// Mock @solana/web3.js — manual mock to avoid ESM issues
// Use jest.fn() inline to avoid hoisting issues
const mockConnection = {
  getBalance: jest.fn(),
  getParsedTokenAccountsByOwner: jest.fn(),
  getSignaturesForAddress: jest.fn(),
  getParsedTransactions: jest.fn(),
  getBlockHeight: jest.fn(),
};

jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((address: string) => {
    if (address.length < 32) throw new Error('Invalid public key');
    return { toString: () => address, toBase58: () => address };
  }),
  Connection: jest.fn().mockImplementation(() => mockConnection),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;
  let mockRateLimiter: any;
  let mockCircuitBreaker: any;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'helius.apiKey': 'test-api-key',
        'helius.rpcUrl': 'https://mainnet.helius-rpc.com/?api-key=test-api-key',
      };
      return config[key] ?? defaultValue;
    }),
  };

  const validAddress = 'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create fresh mocks
    mockRateLimiter = {
      execute: jest.fn().mockImplementation((fn: Function) => fn()),
    };

    mockCircuitBreaker = {
      execute: jest.fn().mockImplementation((fn: Function) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolanaAdapter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RateLimiterService,
          useValue: mockRateLimiter,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreaker,
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

  describe('getNativeBalance', () => {
    it('should return SOL balance in lamports', async () => {
      const lamports = 5_000_000_000; // 5 SOL
      mockConnection.getBalance.mockResolvedValue(lamports);

      const result = await adapter.getNativeBalance(validAddress);

      expect(result).toEqual({
        address: validAddress,
        balance: BigInt(lamports),
        decimals: 9,
        symbol: 'SOL',
      });
      expect(mockConnection.getBalance).toHaveBeenCalledWith(
        expect.any(Object),
      );
    });

    it('should return zero balance for empty wallet', async () => {
      mockConnection.getBalance.mockResolvedValue(0);

      const result = await adapter.getNativeBalance(validAddress);

      expect(result.balance).toBe(BigInt(0));
    });

    it('should throw on invalid address', async () => {
      await expect(
        adapter.getNativeBalance('not-a-valid-address'),
      ).rejects.toThrow('Invalid Solana address');
    });

    it('should use rate limiter and circuit breaker', async () => {
      mockConnection.getBalance.mockResolvedValue(100_000_000);

      await adapter.getNativeBalance(validAddress);

      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
      expect(mockRateLimiter.execute).toHaveBeenCalled();
    });
  });

  describe('getTokenBalances', () => {
    const mockTokenAccount = (mint: string, amount: string, decimals: number, symbol: string) => ({
      pubkey: {},
      account: {
        data: {
          parsed: {
            info: {
              mint,
              tokenAmount: {
                amount,
                decimals,
                uiAmount: parseInt(amount) / Math.pow(10, decimals),
              },
              tokenSymbol: symbol,
            },
          },
        },
      },
    });

    it('should return SPL token balances', async () => {
      const mockResponse = {
        value: [
          mockTokenAccount('mint1', '1000000000', 9, 'USDC'),
          mockTokenAccount('mint2', '500000000', 6, 'USDT'),
        ],
      };
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue(mockResponse);

      const result = await adapter.getTokenBalances(validAddress);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        mint: 'mint1',
        symbol: 'USDC',
        name: '',
        amount: BigInt('1000000000'),
        decimals: 9,
        usdValue: null,
      });
      expect(result[1]).toEqual({
        mint: 'mint2',
        symbol: 'USDT',
        name: '',
        amount: BigInt('500000000'),
        decimals: 6,
        usdValue: null,
      });
    });

    it('should skip zero-balance tokens', async () => {
      const mockResponse = {
        value: [
          mockTokenAccount('mint1', '0', 9, 'USDC'),
          mockTokenAccount('mint2', '500000000', 6, 'USDT'),
        ],
      };
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue(mockResponse);

      const result = await adapter.getTokenBalances(validAddress);

      expect(result).toHaveLength(1);
      expect(result[0].mint).toBe('mint2');
    });

    it('should return empty array when no tokens', async () => {
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({ value: [] });

      const result = await adapter.getTokenBalances(validAddress);

      expect(result).toEqual([]);
    });
  });

  describe('getRecentTransactions', () => {
    const mockSignature = (sig: string, slot: number) => ({
      signature: sig,
      slot,
      blockTime: 1700000000,
      err: null,
      confirmationStatus: 'confirmed',
    });

    const mockParsedTx = (from: string, to: string, amount: number, slot: number) => ({
      slot,
      blockTime: 1700000000,
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1000000000, 0],
        postBalances: [900000000, 100000000],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: { toString: () => from } },
            { pubkey: { toString: () => to } },
          ],
          instructions: [
            {
              programId: { toString: () => '11111111111111111111111111111111' },
              parsed: {
                type: 'transfer',
                info: {
                  source: from,
                  destination: to,
                  lamports: amount,
                },
              },
            },
          ],
        },
      },
    });

    it('should return normalized transactions', async () => {
      const fromAddr = validAddress;
      const toAddr = 'Gg7UjK8Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2';

      mockConnection.getSignaturesForAddress.mockResolvedValue([
        mockSignature('sig1', 100),
        mockSignature('sig2', 99),
      ]);

      mockConnection.getParsedTransactions.mockResolvedValue([
        mockParsedTx(fromAddr, toAddr, 100_000_000, 100),
        mockParsedTx(toAddr, fromAddr, 50_000_000, 99),
      ]);

      const result = await adapter.getRecentTransactions(validAddress, 2);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        signature: 'sig1',
        slot: 100,
        from: fromAddr,
        to: toAddr,
        amount: BigInt(100_000_000),
        fee: BigInt(5000),
        status: 'success',
        type: 'sol_transfer',
      });
      expect(result[0].timestamp).toBeDefined();
    });

    it('should return empty array when no transactions', async () => {
      mockConnection.getSignaturesForAddress.mockResolvedValue([]);

      const result = await adapter.getRecentTransactions(validAddress, 20);

      expect(result).toEqual([]);
    });

    it('should skip transactions with no meta', async () => {
      mockConnection.getSignaturesForAddress.mockResolvedValue([
        mockSignature('sig1', 100),
      ]);

      mockConnection.getParsedTransactions.mockResolvedValue([null]);

      const result = await adapter.getRecentTransactions(validAddress, 20);

      expect(result).toEqual([]);
    });

    it('should mark failed transactions', async () => {
      const fromAddr = validAddress;
      const toAddr = 'Gg7UjK8Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2';

      mockConnection.getSignaturesForAddress.mockResolvedValue([
        mockSignature('sig1', 100),
      ]);

      const failedTx = mockParsedTx(fromAddr, toAddr, 100_000_000, 100);
      failedTx.meta.err = 'InstructionError';
      mockConnection.getParsedTransactions.mockResolvedValue([failedTx]);

      const result = await adapter.getRecentTransactions(validAddress, 20);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('failed');
    });
  });

  describe('checkRpcHealth', () => {
    it('should return healthy result with latency and block height', async () => {
      const { Connection } = jest.requireMock('@solana/web3.js');
      const mockHealthConnection = {
        getBlockHeight: jest.fn().mockResolvedValue(250000000),
      };
      Connection.mockImplementationOnce(() => mockHealthConnection);

      const result = await adapter.checkRpcHealth('https://test.rpc.com');

      expect(result.healthy).toBe(true);
      expect(result.blockHeight).toBe(250000000);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.endpoint).toBe('https://test.rpc.com');
      expect(result.error).toBeUndefined();
    });

    it('should return unhealthy result on error', async () => {
      const { Connection } = jest.requireMock('@solana/web3.js');
      const mockHealthConnection = {
        getBlockHeight: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };
      Connection.mockImplementationOnce(() => mockHealthConnection);

      const result = await adapter.checkRpcHealth('https://bad.rpc.com');

      expect(result.healthy).toBe(false);
      expect(result.blockHeight).toBe(0);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('parseInstructions', () => {
  it('should handle SPL token transfer instructions', async () => {
    // This tests the Tokenkeg... program ID branch
    const { Connection } = jest.requireMock('@solana/web3.js');
    const fromAddr = validAddress;
    const toAddr = 'Gg7UjK8Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2';

    // Create a transaction with SPL token transfer
    const mockTx = {
      meta: {
        err: null,
        fee: 5000,
        innerInstructions: [],
        postBalances: [1000000000, 500000000],
        preBalances: [1100000000, 400000000],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: { toString: () => fromAddr } },
            { pubkey: { toString: () => toAddr } },
          ],
          instructions: [
            {
              programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
              parsed: {
                type: 'transfer',
                info: {
                  source: fromAddr,
                  destination: toAddr,
                  amount: 5000000,
                },
              },
            },
          ],
        },
        signatures: ['sig-spl-transfer'],
      },
      slot: 200,
      blockTime: 1700000000,
    };

    mockConnection.getSignaturesForAddress.mockResolvedValue([
      { signature: 'sig-spl-transfer', slot: 200 },
    ]);
    mockConnection.getParsedTransactions.mockResolvedValue([mockTx]);

    const result = await adapter.getRecentTransactions(validAddress, 20);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('spl_transfer');
    expect(result[0].amount).toBe(BigInt(5000000));
  });

  it('should handle transactions with no parsed instructions (fallback to account keys)', async () => {
    const fromAddr = validAddress;
    const toAddr = 'Gg7UjK8Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2';

    // Transaction with unparsed instructions — should fallback to account keys
    const mockTx = {
      meta: {
        err: null,
        fee: 5000,
        innerInstructions: [],
        postBalances: [500000000, 1000000000],
        preBalances: [1000000000, 500000000],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: { toString: () => fromAddr } },
            { pubkey: { toString: () => toAddr } },
          ],
          instructions: [
            {
              programId: 'SomeOtherProgram',
              parsed: null,
            },
          ],
        },
        signatures: ['sig-fallback'],
      },
      slot: 300,
      blockTime: 1700000001,
    };

    mockConnection.getSignaturesForAddress.mockResolvedValue([
      { signature: 'sig-fallback', slot: 300 },
    ]);
    mockConnection.getParsedTransactions.mockResolvedValue([mockTx]);

    const result = await adapter.getRecentTransactions(validAddress, 20);

    expect(result).toHaveLength(1);
    // Should fallback to account keys for from/to
    expect(result[0].from).toBe(fromAddr);
    expect(result[0].to).toBe(toAddr);
  });

  it('should handle System Program transfer instructions', async () => {
    const fromAddr = validAddress;
    const toAddr = 'Gg7UjK8Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2Kz2';

    const mockTx = {
      meta: {
        err: null,
        fee: 5000,
        innerInstructions: [],
        postBalances: [500000000, 1000000000],
        preBalances: [1000000000, 500000000],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: { toString: () => fromAddr } },
            { pubkey: { toString: () => toAddr } },
          ],
          instructions: [
            {
              programId: '11111111111111111111111111111111',
              parsed: {
                type: 'transfer',
                info: {
                  source: fromAddr,
                  destination: toAddr,
                  lamports: 500000000,
                },
              },
            },
          ],
        },
        signatures: ['sig-system-transfer'],
      },
      slot: 400,
      blockTime: 1700000002,
    };

    mockConnection.getSignaturesForAddress.mockResolvedValue([
      { signature: 'sig-system-transfer', slot: 400 },
    ]);
    mockConnection.getParsedTransactions.mockResolvedValue([mockTx]);

    const result = await adapter.getRecentTransactions(validAddress, 20);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('sol_transfer');
    expect(result[0].amount).toBe(BigInt(500000000));
  });
});
});
