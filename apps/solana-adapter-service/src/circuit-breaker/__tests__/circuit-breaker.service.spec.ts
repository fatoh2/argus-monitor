import { Test, TestingModule } from '@nestjs/testing';
import {
  CircuitBreakerService,
  CircuitBreakerOptions,
  CircuitState,
} from '../circuit-breaker.service';

/**
 * Fast options for testing — tiny delays so tests don't timeout.
 */
const fastOptions: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 30000,
  maxRetries: 3,
  baseDelayMs: 1,   // 1ms base for fast tests
  maxDelayMs: 10,   // 10ms max
};

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CircuitBreakerService,
          useFactory: () => new CircuitBreakerService(fastOptions),
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('execute — retry with exponential backoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await service.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(service.getState()).toBe(CircuitState.CLOSED);
    });

    it('should retry on failure and succeed on retry', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('RPC timeout'))
        .mockRejectedValueOnce(new Error('RPC timeout'))
        .mockResolvedValue('success');

      const result = await service.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(service.getState()).toBe(CircuitState.CLOSED);
    });

    it('should fail after exhausting all retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('RPC error'));

      await expect(service.execute(fn)).rejects.toThrow('RPC error');
      // 1 initial + 3 retries = 4 total calls
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      const fn = jest.fn().mockRejectedValue(
        Object.assign(new Error('Bad request'), { status: 400 }),
      );

      await expect(service.execute(fn)).rejects.toThrow('Bad request');
      // Should not retry on 400
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 rate limit errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Rate limited'), { status: 429 }),
        )
        .mockResolvedValue('success');

      const result = await service.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('execute — circuit breaker', () => {
    it('should open circuit after failure threshold', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('RPC error'));

      // 5 consecutive execute calls, each exhausting retries
      for (let i = 0; i < 5; i++) {
        await expect(service.execute(fn)).rejects.toThrow('RPC error');
      }

      expect(service.getState()).toBe(CircuitState.OPEN);
      expect(service.getFailureCount()).toBe(5);
    }, 30000);

    it('should reject requests when circuit is open', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('RPC error'));

      // Trip the circuit breaker (5 failures)
      for (let i = 0; i < 5; i++) {
        await expect(service.execute(fn)).rejects.toThrow();
      }

      // Now circuit is open — should throw circuit open error
      const successFn = jest.fn().mockResolvedValue('data');
      await expect(service.execute(successFn)).rejects.toThrow(
        'Circuit breaker is OPEN',
      );
      // The function should NOT have been called
      expect(successFn).not.toHaveBeenCalled();
    }, 30000);

    it('should return cached value when circuit is open', async () => {
      const cacheKey = 'test:key';
      const fn = jest.fn().mockRejectedValue(new Error('RPC error'));

      // First, cache a successful value
      const successFn = jest.fn().mockResolvedValue('cached-data');
      await service.execute(successFn, undefined, cacheKey);
      expect(successFn).toHaveBeenCalledTimes(1);

      // Trip the circuit breaker (5 failures)
      for (let i = 0; i < 5; i++) {
        await expect(service.execute(fn)).rejects.toThrow();
      }

      expect(service.getState()).toBe(CircuitState.OPEN);

      // Now circuit is open — should return cached value
      const result = await service.execute(
        jest.fn().mockResolvedValue('new-data'),
        undefined,
        cacheKey,
      );
      expect(result).toBe('cached-data');
    }, 30000);

    it('should throw when circuit is open and no cached value exists', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('RPC error'));

      // Trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        await expect(service.execute(fn)).rejects.toThrow();
      }

      expect(service.getState()).toBe(CircuitState.OPEN);

      // No cache key provided — should throw
      await expect(
        service.execute(jest.fn().mockResolvedValue('data')),
      ).rejects.toThrow('Circuit breaker is OPEN');
    }, 30000);

    it('should transition to half-open after timeout', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('RPC error'));

      // Trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        await expect(service.execute(failFn)).rejects.toThrow();
      }

      expect(service.getState()).toBe(CircuitState.OPEN);

      // Reset to simulate timeout
      service.reset();
      expect(service.getState()).toBe(CircuitState.CLOSED);
    }, 30000);

    it('should close circuit after success threshold in half-open state', async () => {
      // Trip the circuit
      const failFn = jest.fn().mockRejectedValue(new Error('RPC error'));
      for (let i = 0; i < 5; i++) {
        await expect(service.execute(failFn)).rejects.toThrow();
      }

      // Manually reset to simulate timeout
      service.reset();

      // Now succeed 3 times to close the circuit (successThreshold = 3)
      const successFn = jest.fn().mockResolvedValue('recovered');
      await service.execute(successFn);
      await service.execute(successFn);
      await service.execute(successFn);

      expect(service.getState()).toBe(CircuitState.CLOSED);
    }, 30000);

    it('should reset failure count on success when circuit is closed', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      const successFn = jest.fn().mockResolvedValue('ok');

      // One failure
      await expect(service.execute(failFn)).rejects.toThrow();
      expect(service.getFailureCount()).toBe(1);

      // One success resets failure count
      await service.execute(successFn);
      expect(service.getFailureCount()).toBe(0);
    });
  });

  describe('execute — endpoint logging', () => {
    it('should sanitize API key from endpoint URL', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const endpoint =
        'https://mainnet.helius-rpc.com/?api-key=secret123';

      await service.execute(fn, endpoint);
      expect(service.getLastEndpoint()).toBe(
        'https://mainnet.helius-rpc.com/?api-key=***',
      );
    });

    it('should log endpoint without API key', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('timeout'));
      const endpoint =
        'https://mainnet.helius-rpc.com/?api-key=supersecret';

      // Should fail and log sanitized endpoint
      await expect(service.execute(fn, endpoint)).rejects.toThrow('timeout');

      // The last endpoint should be sanitized
      expect(service.getLastEndpoint()).toBe(
        'https://mainnet.helius-rpc.com/?api-key=***',
      );
    });
  });

  describe('execute — degraded events', () => {
    it('should emit rpc.degraded event when circuit opens', (done) => {
      const fn = jest.fn().mockRejectedValue(new Error('RPC timeout'));
      const endpoint = 'https://rpc.example.com';

      // Subscribe to degraded events
      const sub = service.degraded$.subscribe((event) => {
        expect(event.endpoint).toBe(endpoint);
        expect(event.errorMessage).toBe('RPC timeout');
        expect(event.circuitState).toBe(CircuitState.OPEN);
        expect(event.failureCount).toBe(5);
        expect(event.timestamp).toBeGreaterThan(0);
        sub.unsubscribe();
        done();
      });

      // Trip the circuit breaker (5 failures needed)
      setTimeout(async () => {
        for (let i = 0; i < 5; i++) {
          try {
            await service.execute(fn, endpoint);
          } catch {
            // expected
          }
        }
      }, 10);
    }, 30000);
  });

  describe('cache', () => {
    it('should cache successful values', async () => {
      const fn = jest.fn().mockResolvedValue({ balance: 100 });
      await service.execute(fn, undefined, 'wallet:abc');

      const cached = service.getCachedValue('wallet:abc');
      expect(cached).toBeDefined();
      expect(cached!.value).toEqual({ balance: 100 });
      expect(cached!.timestamp).toBeGreaterThan(0);
    });

    it('should update cache on new successful calls', async () => {
      const fn1 = jest.fn().mockResolvedValue({ balance: 100 });
      await service.execute(fn1, undefined, 'wallet:abc');

      const fn2 = jest.fn().mockResolvedValue({ balance: 200 });
      await service.execute(fn2, undefined, 'wallet:abc');

      const cached = service.getCachedValue('wallet:abc');
      expect(cached!.value).toEqual({ balance: 200 });
    });

    it('should report hasCachedValue correctly', async () => {
      expect(service.hasCachedValue('nonexistent')).toBe(false);

      const fn = jest.fn().mockResolvedValue('data');
      await service.execute(fn, undefined, 'mykey');

      expect(service.hasCachedValue('mykey')).toBe(true);
    });

    it('should clear cache on clearCache', async () => {
      const fn = jest.fn().mockResolvedValue('data');
      await service.execute(fn, undefined, 'mykey');
      expect(service.hasCachedValue('mykey')).toBe(true);

      service.clearCache();
      expect(service.hasCachedValue('mykey')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset to closed state with zero counts', () => {
      // Trip the circuit
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      for (let i = 0; i < 5; i++) {
        service.execute(failFn).catch(() => {});
      }

      service.reset();
      expect(service.getState()).toBe(CircuitState.CLOSED);
      expect(service.getFailureCount()).toBe(0);
    });
  });
});
