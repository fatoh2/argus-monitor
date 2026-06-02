import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService, RateLimiterOptions } from '../rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  const defaultOptions: RateLimiterOptions = {
    maxRequestsPerSecond: 10,
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 10000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RateLimiterService,
          useFactory: () => new RateLimiterService(defaultOptions),
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  describe('execute', () => {
    it('should execute a function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await service.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary error'))
        .mockRejectedValueOnce(new Error('temporary error'))
        .mockResolvedValue('success');

      const result = await service.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      const error = new Error('persistent error');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(service.execute(fn)).rejects.toThrow('persistent error');
      expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      const clientError = new Error('Bad Request');
      (clientError as any).status = 400;
      const fn = jest.fn().mockRejectedValue(clientError);

      await expect(service.execute(fn)).rejects.toThrow('Bad Request');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 rate limit errors', async () => {
      const rateLimitError = new Error('Too Many Requests');
      (rateLimitError as any).status = 429;
      const fn = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');

      const result = await service.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
