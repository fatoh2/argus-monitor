import { Test, TestingModule } from '@nestjs/testing';
import { RpcMonitorController } from './rpc-monitor.controller';
import { RpcMonitorService } from './rpc-monitor.service';

describe('RpcMonitorController', () => {
  let controller: RpcMonitorController;
  let service: jest.Mocked<RpcMonitorService>;

  const mockEndpoints = ['https://rpc1.solana.com', 'https://rpc2.solana.com'];

  const mockSnapshot = {
    endpoint: 'https://rpc1.solana.com',
    healthy: true,
    latency: 150,
    lastChecked: new Date('2024-01-01T00:00:00Z'),
    blockHeight: 250000000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RpcMonitorController],
      providers: [
        {
          provide: RpcMonitorService,
          useValue: {
            getMonitoredEndpoints: jest.fn(),
            getLatestSnapshot: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RpcMonitorController>(RpcMonitorController);
    service = module.get(RpcMonitorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('returns ok status when all endpoints are healthy', () => {
      service.getMonitoredEndpoints.mockReturnValue(mockEndpoints);
      service.getLatestSnapshot.mockReturnValue(mockSnapshot);

      const result = controller.getHealth();

      expect(result).toEqual({
        status: 'ok',
        monitoredEndpoints: 2,
        endpoints: [
          { endpoint: 'https://rpc1.solana.com', latest: mockSnapshot },
          { endpoint: 'https://rpc2.solana.com', latest: mockSnapshot },
        ],
      });
    });

    it('returns degraded status when some endpoints are unhealthy', () => {
      service.getMonitoredEndpoints.mockReturnValue(mockEndpoints);
      service.getLatestSnapshot
        .mockReturnValueOnce(mockSnapshot)
        .mockReturnValueOnce({ ...mockSnapshot, healthy: false });

      const result = controller.getHealth();

      expect(result.status).toBe('degraded');
    });

    it('returns degraded status when some endpoints have no snapshot', () => {
      service.getMonitoredEndpoints.mockReturnValue(mockEndpoints);
      service.getLatestSnapshot
        .mockReturnValueOnce(mockSnapshot)
        .mockReturnValueOnce(null);

      const result = controller.getHealth();

      expect(result.status).toBe('degraded');
    });

    it('returns ok status when there are no monitored endpoints', () => {
      service.getMonitoredEndpoints.mockReturnValue([]);

      const result = controller.getHealth();

      expect(result).toEqual({
        status: 'ok',
        monitoredEndpoints: 0,
        endpoints: [],
      });
    });

    it('returns ok status when single endpoint is healthy', () => {
      service.getMonitoredEndpoints.mockReturnValue(['https://rpc1.solana.com']);
      service.getLatestSnapshot.mockReturnValue(mockSnapshot);

      const result = controller.getHealth();

      expect(result.status).toBe('ok');
      expect(result.monitoredEndpoints).toBe(1);
    });
  });

  describe('getEndpointHealth', () => {
    it('returns snapshot for a healthy endpoint', () => {
      const endpoint = 'https://rpc1.solana.com';
      service.getLatestSnapshot.mockReturnValue(mockSnapshot);

      const result = controller.getEndpointHealth(endpoint);

      expect(result).toEqual(mockSnapshot);
      expect(service.getLatestSnapshot).toHaveBeenCalledWith(endpoint);
    });

    it('decodes URL-encoded endpoint parameter', () => {
      const encodedEndpoint = encodeURIComponent('https://rpc1.solana.com');
      service.getLatestSnapshot.mockReturnValue(mockSnapshot);

      controller.getEndpointHealth(encodedEndpoint);

      expect(service.getLatestSnapshot).toHaveBeenCalledWith('https://rpc1.solana.com');
    });

    it('returns error response when no snapshot available', () => {
      const endpoint = 'https://unknown-rpc.solana.com';
      service.getLatestSnapshot.mockReturnValue(null);

      const result = controller.getEndpointHealth(endpoint);

      expect(result).toEqual({
        endpoint,
        healthy: false,
        error: 'No health data available yet',
      });
    });

    it('returns error response for endpoint with special characters', () => {
      const endpoint = 'https://rpc.solana.com/api/v2?key=test';
      const encodedEndpoint = encodeURIComponent(endpoint);
      service.getLatestSnapshot.mockReturnValue(null);

      const result = controller.getEndpointHealth(encodedEndpoint);

      expect(result).toEqual({
        endpoint,
        healthy: false,
        error: 'No health data available yet',
      });
    });
  });
});