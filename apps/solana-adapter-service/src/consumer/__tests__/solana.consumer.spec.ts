import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { SolanaConsumer } from '../solana.consumer';
import { SolanaAdapter } from '../../adapter/solana.adapter';

// Mock the shared-types module
jest.mock('@argus/shared-types', () => ({
  QUEUES: {
    SOLANA_FETCH: 'solana:fetch',
  },
}));

// Mock @solana/web3.js to avoid ESM import issues
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((address: string) => {
    if (address.length < 32) throw new Error('Invalid public key');
    return { toString: () => address, toBase58: () => address };
  }),
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn(),
    getParsedTokenAccountsByOwner: jest.fn(),
    getSignaturesForAddress: jest.fn(),
    getParsedTransactions: jest.fn(),
    getBlockHeight: jest.fn(),
  })),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

describe('SolanaConsumer', () => {
  let consumer: SolanaConsumer;
  let mockAdapter: any;

  const createMockJob = (data: any): Job => {
    return {
      id: 'test-job-1',
      data,
      attemptsMade: 0,
      name: 'solana:fetch',
      queue: {} as any,
      opts: {},
      timestamp: Date.now(),
      processedOn: Date.now(),
      finishedOn: undefined,
      failedReason: undefined,
      stacktrace: [],
      returnvalue: undefined,
      toJSON: () => ({}),
      remove: jest.fn(),
      update: jest.fn(),
      discard: jest.fn(),
      retry: jest.fn(),
      log: jest.fn(),
      moveToCompleted: jest.fn(),
      moveToFailed: jest.fn(),
      isCompleted: jest.fn(),
      isFailed: jest.fn(),
      isDelayed: jest.fn(),
      isWaiting: jest.fn(),
      isActive: jest.fn(),
      getState: jest.fn(),
      changeDelay: jest.fn(),
      waitUntilFinished: jest.fn(),
      addJob: jest.fn(),
      progress: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  };

  beforeEach(async () => {
    mockAdapter = {
      getNativeBalance: jest.fn(),
      getTokenBalances: jest.fn(),
      getRecentTransactions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolanaConsumer,
        {
          provide: SolanaAdapter,
          useValue: mockAdapter,
        },
      ],
    }).compile();

    consumer = module.get<SolanaConsumer>(SolanaConsumer);
  });

  describe('process', () => {
    it('should process balance check jobs', async () => {
      mockAdapter.getNativeBalance.mockResolvedValue({
        address: 'test-address',
        balance: BigInt(5_000_000_000),
        decimals: 9,
        symbol: 'SOL',
      });

      const job = createMockJob({
        walletId: 'wallet-1',
        address: 'test-address',
        monitorType: 'balance',
      });

      const result = await consumer.process(job);

      expect(result).toMatchObject({
        walletId: 'wallet-1',
        address: 'test-address',
        monitorType: 'balance',
        data: {
          balance: '5000000000',
          decimals: 9,
          symbol: 'SOL',
        },
      });
      expect(result.timestamp).toBeDefined();
      expect(mockAdapter.getNativeBalance).toHaveBeenCalledWith('test-address');
    });

    it('should process transaction check jobs', async () => {
      mockAdapter.getRecentTransactions.mockResolvedValue([
        {
          signature: 'sig1',
          slot: 100,
          timestamp: 1700000000,
          from: 'from-addr',
          to: 'to-addr',
          amount: BigInt(100_000_000),
          fee: BigInt(5000),
          status: 'success',
          type: 'sol_transfer',
        },
      ]);

      const job = createMockJob({
        walletId: 'wallet-1',
        address: 'test-address',
        monitorType: 'transaction',
      });

      const result = await consumer.process(job);

      expect(result).toMatchObject({
        walletId: 'wallet-1',
        monitorType: 'transaction',
        data: {
          count: 1,
          transactions: [
            {
              signature: 'sig1',
              amount: '100000000',
              fee: '5000',
              status: 'success',
            },
          ],
        },
      });
      expect(mockAdapter.getRecentTransactions).toHaveBeenCalledWith(
        'test-address',
        20,
      );
    });

    it('should process token check jobs', async () => {
      mockAdapter.getTokenBalances.mockResolvedValue([
        {
          mint: 'mint1',
          symbol: 'USDC',
          name: 'USD Coin',
          amount: BigInt('1000000'),
          decimals: 6,
          usdValue: null,
        },
      ]);

      const job = createMockJob({
        walletId: 'wallet-1',
        address: 'test-address',
        monitorType: 'token_account',
      });

      const result = await consumer.process(job);

      expect(result).toMatchObject({
        walletId: 'wallet-1',
        monitorType: 'token_account',
        data: {
          count: 1,
          tokens: [
            {
              mint: 'mint1',
              symbol: 'USDC',
              amount: '1000000',
            },
          ],
        },
      });
      expect(mockAdapter.getTokenBalances).toHaveBeenCalledWith('test-address');
    });

    it('should skip unknown monitor types', async () => {
      const job = createMockJob({
        walletId: 'wallet-1',
        address: 'test-address',
        monitorType: 'unknown_type',
      });

      const result = await consumer.process(job);

      expect(result).toEqual({
        status: 'skipped',
        reason: 'Unknown monitor type: unknown_type',
      });
    });

    it('should throw on adapter error for retry handling', async () => {
      mockAdapter.getNativeBalance.mockRejectedValue(
        new Error('RPC timeout'),
      );

      const job = createMockJob({
        walletId: 'wallet-1',
        address: 'test-address',
        monitorType: 'balance',
      });

      await expect(consumer.process(job)).rejects.toThrow('RPC timeout');
    });
  });
});
