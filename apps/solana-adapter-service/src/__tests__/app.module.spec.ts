import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUES } from '@argus/shared-types';

// Mock @solana/web3.js before any imports that use it
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn(),
    getParsedTokenAccountsByOwner: jest.fn(),
    getSignaturesForAddress: jest.fn(),
    getParsedTransactions: jest.fn(),
    getBlockHeight: jest.fn(),
  })),
  PublicKey: jest.fn().mockImplementation((address: string) => {
    if (address === 'invalid') throw new Error('Invalid public key');
    return { toBase58: () => address, toString: () => address };
  }),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

describe('AppModule (solana-adapter-service)', () => {
  it('should compile the module without errors', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'redis.host': 'localhost',
            'redis.port': 6379,
            'helius.apiKey': 'test-key',
            'helius.rpcUrl': 'https://mainnet.helius-rpc.com/?api-key=test-key',
            'rpcMonitor.pollIntervalMs': 30000,
            'rpcMonitor.maxSnapshots': 10,
            'rpcMonitor.endpoints': [],
            'rateLimiter': {
              maxRequestsPerSecond: 10,
              maxRetries: 3,
              baseDelayMs: 1000,
              maxDelayMs: 30000,
            },
            'circuitBreaker': {
              failureThreshold: 5,
              successThreshold: 3,
              timeoutMs: 30000,
              maxRetries: 3,
              baseDelayMs: 500,
              maxDelayMs: 2000,
            },
          };
          return config[key] !== undefined ? config[key] : defaultValue;
        }),
      })
      .overrideProvider(getQueueToken(QUEUES.SOLANA_FETCH))
      .useValue({ add: jest.fn(), process: jest.fn() })
      .compile();

    expect(module).toBeDefined();
  });
});
