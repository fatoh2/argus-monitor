/**
 * Solana Adapter Service Configuration
 */
export default () => ({
  port: parseInt(process.env.PORT || '3002', 10),
  helius: {
    apiKey: process.env.HELIUS_API_KEY || '',
    rpcUrl:
      process.env.HELIUS_RPC_URL ||
      'https://mainnet.helius-rpc.com/?api-key=',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  rateLimiter: {
    maxRequestsPerSecond: parseInt(
      process.env.RATE_LIMITER_MAX_RPS || '10',
      10,
    ),
    maxRetries: parseInt(process.env.RATE_LIMITER_MAX_RETRIES || '3', 10),
    baseDelayMs: parseInt(process.env.RATE_LIMITER_BASE_DELAY_MS || '1000', 10),
    maxDelayMs: parseInt(process.env.RATE_LIMITER_MAX_DELAY_MS || '30000', 10),
  },
  circuitBreaker: {
    failureThreshold: parseInt(
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5',
      10,
    ),
    successThreshold: parseInt(
      process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3',
      10,
    ),
    timeoutMs: parseInt(
      process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '30000',
      10,
    ),
    maxRetries: parseInt(
      process.env.CIRCUIT_BREAKER_MAX_RETRIES || '3',
      10,
    ),
    baseDelayMs: parseInt(
      process.env.CIRCUIT_BREAKER_BASE_DELAY_MS || '500',
      10,
    ),
    maxDelayMs: parseInt(
      process.env.CIRCUIT_BREAKER_MAX_DELAY_MS || '2000',
      10,
    ),
  },
  rpcMonitor: {
    pollIntervalMs: parseInt(
      process.env.RPC_MONITOR_POLL_INTERVAL_MS || '30000',
      10,
    ),
    maxSnapshots: parseInt(
      process.env.RPC_MONITOR_MAX_SNAPSHOTS || '10',
      10,
    ),
    endpoints: process.env.RPC_MONITOR_ENDPOINTS
      ? process.env.RPC_MONITOR_ENDPOINTS.split(',')
      : [],
  },
});
