import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SolanaAdapter } from '../../adapter/solana.adapter';
import { RpcMonitorService, RpcHealthSnapshot, RpcStatusChangedEvent } from '../rpc-monitor.service';

// Mock @argus/shared-types
jest.mock('@argus/shared-types', () => ({}));

// Mock @solana/web3.js to avoid ESM import issues
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((address: string) => {
    if (address.length < 32) throw new Error('Invalid public key');
    return { toString: () => address, toBase58: () => address };
  }),
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn(),
    getBlockHeight: jest.fn(),
  })),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

describe('RpcMonitorService', () => {
  let service: RpcMonitorService;
  let mockAdapter: any;

  const testEndpoint = 'https://api.mainnet-beta.solana.com';

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'helius.rpcUrl': 'https://mainnet.helius-rpc.com/?api-key=test-key',
        'rpcMonitor.pollIntervalMs': 30_000,
        'rpcMonitor.maxSnapshots': 10,
        'rpcMonitor.endpoints': [testEndpoint],
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockAdapter = {
      checkRpcHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RpcMonitorService,
        {
          provide: SolanaAdapter,
          useValue: mockAdapter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RpcMonitorService>(RpcMonitorService);
  });

  afterEach(() => {
    jest.useRealTimers();
    service.stopMonitoring();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return configured endpoints', () => {
      const endpoints = service.getMonitoredEndpoints();
      expect(endpoints).toEqual([testEndpoint]);
    });

    it('should start monitoring on module init', () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 150,
        blockHeight: 250000000,
      });

      service.onModuleInit();

      // Should have called checkEndpoint immediately
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledWith(testEndpoint);
    });
  });

  describe('checkEndpoint', () => {
    it('should return a health snapshot on success', async () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 120,
        blockHeight: 250000001,
      });

      const snapshot = await service.checkEndpoint(testEndpoint);

      expect(snapshot).toEqual({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 120,
        blockHeight: 250000001,
        error: undefined,
        timestamp: expect.any(String),
      });
      expect(snapshot.timestamp).toBeDefined();
    });

    it('should return a health snapshot on failure', async () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: false,
        latencyMs: 5000,
        blockHeight: 0,
        error: 'Connection timeout',
      });

      const snapshot = await service.checkEndpoint(testEndpoint);

      expect(snapshot).toEqual({
        endpoint: testEndpoint,
        healthy: false,
        latencyMs: 5000,
        blockHeight: 0,
        error: 'Connection timeout',
        timestamp: expect.any(String),
      });
    });

    it('should handle adapter throwing an error defensively', async () => {
      mockAdapter.checkRpcHealth.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const snapshot = await service.checkEndpoint(testEndpoint);

      expect(snapshot.healthy).toBe(false);
      expect(snapshot.error).toBe('Unexpected error');
      expect(snapshot.endpoint).toBe(testEndpoint);
    });

    it('should store the snapshot and make it retrievable', async () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 100,
        blockHeight: 250000000,
      });

      await service.checkEndpoint(testEndpoint);

      const snapshots = service.getSnapshots(testEndpoint);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].healthy).toBe(true);
      expect(snapshots[0].blockHeight).toBe(250000000);
    });

    it('should keep only the latest snapshot via getLatestSnapshot', async () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 100,
        blockHeight: 250000000,
      });

      await service.checkEndpoint(testEndpoint);

      const latest = service.getLatestSnapshot(testEndpoint);
      expect(latest).not.toBeNull();
      expect(latest!.blockHeight).toBe(250000000);
    });

    it('should return null for getLatestSnapshot when no checks done', () => {
      const latest = service.getLatestSnapshot(testEndpoint);
      expect(latest).toBeNull();
    });

    it('should return empty array for getSnapshots when no checks done', () => {
      const snapshots = service.getSnapshots(testEndpoint);
      expect(snapshots).toEqual([]);
    });
  });

  describe('snapshot storage', () => {
    it('should store multiple snapshots in order (most recent first)', async () => {
      mockAdapter.checkRpcHealth
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 100,
          blockHeight: 250000000,
        })
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 200,
          blockHeight: 250000001,
        });

      await service.checkEndpoint(testEndpoint);
      await service.checkEndpoint(testEndpoint);

      const snapshots = service.getSnapshots(testEndpoint);
      expect(snapshots).toHaveLength(2);
      // Most recent first
      expect(snapshots[0].blockHeight).toBe(250000001);
      expect(snapshots[1].blockHeight).toBe(250000000);
    });

    it('should respect maxSnapshots limit', async () => {
      // Override config to limit to 3 snapshots
      const limitedConfig = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'helius.rpcUrl': 'https://mainnet.helius-rpc.com/?api-key=test-key',
            'rpcMonitor.pollIntervalMs': 30_000,
            'rpcMonitor.maxSnapshots': 3,
            'rpcMonitor.endpoints': [testEndpoint],
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RpcMonitorService,
          {
            provide: SolanaAdapter,
            useValue: mockAdapter,
          },
          {
            provide: ConfigService,
            useValue: limitedConfig,
          },
        ],
      }).compile();

      const limitedService = module.get<RpcMonitorService>(RpcMonitorService);

      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 100,
        blockHeight: 250000000,
      });

      // Add 5 snapshots
      for (let i = 0; i < 5; i++) {
        await limitedService.checkEndpoint(testEndpoint);
      }

      const snapshots = limitedService.getSnapshots(testEndpoint);
      expect(snapshots).toHaveLength(3);

      limitedService.stopMonitoring();
    });
  });

  describe('status_changed events', () => {
    it('should emit status_changed when health goes from healthy to unhealthy', async () => {
      mockAdapter.checkRpcHealth
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 100,
          blockHeight: 250000000,
        })
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: false,
          latencyMs: 5000,
          blockHeight: 0,
          error: 'Connection refused',
        });

      const events: RpcStatusChangedEvent[] = [];
      service.statusChanged$.subscribe((event) => events.push(event));

      // First check — healthy
      await service.checkEndpoint(testEndpoint);
      expect(events).toHaveLength(0); // No event on first check

      // Second check — unhealthy, should emit
      await service.checkEndpoint(testEndpoint);
      expect(events).toHaveLength(1);
      expect(events[0].endpoint).toBe(testEndpoint);
      expect(events[0].current.healthy).toBe(false);
      expect(events[0].previous).not.toBeNull();
      expect(events[0].previous!.healthy).toBe(true);
    });

    it('should emit status_changed when health goes from unhealthy to healthy', async () => {
      mockAdapter.checkRpcHealth
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: false,
          latencyMs: 5000,
          blockHeight: 0,
          error: 'Connection refused',
        })
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 100,
          blockHeight: 250000000,
        });

      const events: RpcStatusChangedEvent[] = [];
      service.statusChanged$.subscribe((event) => events.push(event));

      // First check — unhealthy
      await service.checkEndpoint(testEndpoint);
      expect(events).toHaveLength(0);

      // Second check — healthy, should emit
      await service.checkEndpoint(testEndpoint);
      expect(events).toHaveLength(1);
      expect(events[0].endpoint).toBe(testEndpoint);
      expect(events[0].current.healthy).toBe(true);
      expect(events[0].previous!.healthy).toBe(false);
    });

    it('should NOT emit status_changed when health stays the same', async () => {
      mockAdapter.checkRpcHealth
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 100,
          blockHeight: 250000000,
        })
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 150,
          blockHeight: 250000001,
        })
        .mockResolvedValueOnce({
          endpoint: testEndpoint,
          healthy: true,
          latencyMs: 120,
          blockHeight: 250000002,
        });

      const events: RpcStatusChangedEvent[] = [];
      service.statusChanged$.subscribe((event) => events.push(event));

      // Three checks, all healthy
      await service.checkEndpoint(testEndpoint);
      await service.checkEndpoint(testEndpoint);
      await service.checkEndpoint(testEndpoint);

      expect(events).toHaveLength(0); // No state changes
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('should poll endpoints on interval', async () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 100,
        blockHeight: 250000000,
      });

      service.startMonitoring();

      // Initial check
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledTimes(1);

      // Advance time by one interval
      jest.advanceTimersByTime(30_000);
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledTimes(2);

      // Advance again
      jest.advanceTimersByTime(30_000);
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledTimes(3);
    });

    it('should stop polling when stopMonitoring is called', async () => {
      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: testEndpoint,
        healthy: true,
        latencyMs: 100,
        blockHeight: 250000000,
      });

      service.startMonitoring();

      // Initial check
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledTimes(1);

      service.stopMonitoring();

      // Advance time — should NOT trigger more checks
      jest.advanceTimersByTime(60_000);
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple endpoints', () => {
    it('should monitor multiple endpoints', async () => {
      const endpointA = 'https://rpc1.solana.com';
      const endpointB = 'https://rpc2.solana.com';

      const multiConfig = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'helius.rpcUrl': 'https://mainnet.helius-rpc.com/?api-key=test-key',
            'rpcMonitor.pollIntervalMs': 30_000,
            'rpcMonitor.maxSnapshots': 10,
            'rpcMonitor.endpoints': [endpointA, endpointB],
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RpcMonitorService,
          {
            provide: SolanaAdapter,
            useValue: mockAdapter,
          },
          {
            provide: ConfigService,
            useValue: multiConfig,
          },
        ],
      }).compile();

      const multiService = module.get<RpcMonitorService>(RpcMonitorService);

      mockAdapter.checkRpcHealth.mockResolvedValue({
        endpoint: '',
        healthy: true,
        latencyMs: 100,
        blockHeight: 250000000,
      });

      multiService.startMonitoring();

      // Should have checked both endpoints
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledWith(endpointA);
      expect(mockAdapter.checkRpcHealth).toHaveBeenCalledWith(endpointB);

      multiService.stopMonitoring();
    });
  });
});
