import configuration from '../configuration';

describe('Configuration (solana-adapter-service)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no env vars are set', () => {
    delete process.env.PORT;
    delete process.env.HELIUS_API_KEY;
    delete process.env.HELIUS_RPC_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.RATE_LIMITER_MAX_RPS;
    delete process.env.RATE_LIMITER_MAX_RETRIES;
    delete process.env.RATE_LIMITER_BASE_DELAY_MS;
    delete process.env.RATE_LIMITER_MAX_DELAY_MS;
    delete process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    delete process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD;
    delete process.env.CIRCUIT_BREAKER_TIMEOUT_MS;
    delete process.env.CIRCUIT_BREAKER_MAX_RETRIES;
    delete process.env.CIRCUIT_BREAKER_BASE_DELAY_MS;
    delete process.env.CIRCUIT_BREAKER_MAX_DELAY_MS;

    const config = configuration();

    expect(config.port).toBe(3002);
    expect(config.helius.apiKey).toBe('');
    expect(config.helius.rpcUrl).toBe('https://mainnet.helius-rpc.com/?api-key=');
    expect(config.redis.host).toBe('localhost');
    expect(config.redis.port).toBe(6379);
    expect(config.rateLimiter.maxRequestsPerSecond).toBe(10);
    expect(config.rateLimiter.maxRetries).toBe(3);
    expect(config.rateLimiter.baseDelayMs).toBe(1000);
    expect(config.rateLimiter.maxDelayMs).toBe(30000);
    expect(config.circuitBreaker.failureThreshold).toBe(5);
    expect(config.circuitBreaker.successThreshold).toBe(3);
    expect(config.circuitBreaker.timeoutMs).toBe(30000);
    expect(config.circuitBreaker.maxRetries).toBe(3);
    expect(config.circuitBreaker.baseDelayMs).toBe(500);
    expect(config.circuitBreaker.maxDelayMs).toBe(2000);
  });

  it('should use environment variable values when set', () => {
    process.env.PORT = '4000';
    process.env.HELIUS_API_KEY = 'test-key';
    process.env.HELIUS_RPC_URL = 'https://custom.rpc.com';
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.REDIS_PORT = '6380';
    process.env.RATE_LIMITER_MAX_RPS = '50';
    process.env.RATE_LIMITER_MAX_RETRIES = '5';
    process.env.RATE_LIMITER_BASE_DELAY_MS = '2000';
    process.env.RATE_LIMITER_MAX_DELAY_MS = '60000';
    process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '10';
    process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD = '5';
    process.env.CIRCUIT_BREAKER_TIMEOUT_MS = '60000';
    process.env.CIRCUIT_BREAKER_MAX_RETRIES = '5';
    process.env.CIRCUIT_BREAKER_BASE_DELAY_MS = '1000';
    process.env.CIRCUIT_BREAKER_MAX_DELAY_MS = '5000';

    const config = configuration();

    expect(config.port).toBe(4000);
    expect(config.helius.apiKey).toBe('test-key');
    expect(config.helius.rpcUrl).toBe('https://custom.rpc.com');
    expect(config.redis.host).toBe('redis.example.com');
    expect(config.redis.port).toBe(6380);
    expect(config.rateLimiter.maxRequestsPerSecond).toBe(50);
    expect(config.rateLimiter.maxRetries).toBe(5);
    expect(config.rateLimiter.baseDelayMs).toBe(2000);
    expect(config.rateLimiter.maxDelayMs).toBe(60000);
    expect(config.circuitBreaker.failureThreshold).toBe(10);
    expect(config.circuitBreaker.successThreshold).toBe(5);
    expect(config.circuitBreaker.timeoutMs).toBe(60000);
    expect(config.circuitBreaker.maxRetries).toBe(5);
    expect(config.circuitBreaker.baseDelayMs).toBe(1000);
    expect(config.circuitBreaker.maxDelayMs).toBe(5000);
  });
});
