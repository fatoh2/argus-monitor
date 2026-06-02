import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  /** Maximum retry attempts before failing */
  maxRetries: number;
  /** Base delay in ms for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in ms for backoff */
  maxDelayMs: number;
}

export interface RpcDegradedEvent {
  endpoint: string;
  errorCode?: string;
  errorMessage: string;
  circuitState: CircuitState;
  failureCount: number;
  timestamp: number;
}

export interface CachedValue<T = unknown> {
  value: T;
  timestamp: number;
}

/**
 * Circuit breaker pattern with exponential backoff retry and caching.
 *
 * - Wraps RPC calls with retry (exponential backoff)
 * - Opens circuit after consecutive failures
 * - Returns cached last-known value when circuit is open
 * - Emits `rpc.degraded` events via observable
 * - Logs each failure with endpoint, error code, attempt number
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private lastEndpoint: string = '';

  /** Cache of last-known values keyed by a logical operation key */
  private readonly cache = new Map<string, CachedValue>();

  /** Observable stream of RPC degraded events */
  private readonly degradedSubject = new Subject<RpcDegradedEvent>();
  readonly degraded$ = this.degradedSubject.asObservable();

  constructor(private readonly options: CircuitBreakerOptions) {}

  /**
   * Execute a function with circuit breaker protection and retry.
   *
   * @param fn - The async function to execute
   * @param endpoint - The RPC endpoint URL (API key will be stripped for logging)
   * @param cacheKey - Optional key to cache/return last-known value
   */
  async execute<T>(
    fn: () => Promise<T>,
    endpoint?: string,
    cacheKey?: string,
  ): Promise<T> {
    if (endpoint) {
      this.lastEndpoint = this.sanitizeEndpoint(endpoint);
    }

    // Circuit is OPEN — return cached value if available
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.logger.log(
          `[${this.lastEndpoint}] Circuit half-open: testing if service has recovered`,
        );
        this.state = CircuitState.HALF_OPEN;
      } else {
        // Return cached value if available
        if (cacheKey && this.cache.has(cacheKey)) {
          const cached = this.cache.get(cacheKey)!;
          this.logger.warn(
            `[${this.lastEndpoint}] Circuit OPEN — returning cached value from ${new Date(cached.timestamp).toISOString()}`,
          );
          return cached.value as T;
        }
        throw new Error(
          `Circuit breaker is OPEN for ${this.lastEndpoint || 'RPC'}. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`,
        );
      }
    }

    // Attempt with retry
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.calculateBackoff(attempt);
        this.logger.warn(
          `[${this.lastEndpoint}] Retry attempt ${attempt}/${this.options.maxRetries} after ${delay}ms`,
        );
        await this.sleep(delay);
      }

      try {
        const result = await fn();
        this.onSuccess();

        // Cache the successful value
        if (cacheKey) {
          this.cache.set(cacheKey, {
            value: result,
            timestamp: Date.now(),
          });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Extract error code
        const errorCode = this.extractErrorCode(error);
        const errorMessage = lastError.message;

        this.logger.warn(
          `[${this.lastEndpoint}] Attempt ${attempt + 1}/${this.options.maxRetries + 1} failed: code=${errorCode}, error=${errorMessage}`,
        );

        // Don't retry on 4xx errors (client errors) except 429 (rate limited)
        if (error instanceof Error && 'status' in error) {
          const status = (error as any).status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            this.onFailure(endpoint, errorCode, errorMessage);
            throw error;
          }
        }

        if (attempt >= this.options.maxRetries) {
          this.onFailure(endpoint, errorCode, errorMessage);
          throw lastError;
        }
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Circuit breaker: max retries exceeded');
  }

  /**
   * Record a successful call.
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.logger.log(
          `[${this.lastEndpoint}] Circuit closed: service has recovered`,
        );
        this.reset();
      }
    } else {
      // Reset failure count on success when closed
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed call.
   */
  private onFailure(
    endpoint?: string,
    errorCode?: string,
    errorMessage?: string,
  ): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.failureCount >= this.options.failureThreshold &&
      this.state === CircuitState.CLOSED
    ) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.timeoutMs;

      const event: RpcDegradedEvent = {
        endpoint: this.sanitizeEndpoint(endpoint || this.lastEndpoint),
        errorCode,
        errorMessage: errorMessage || 'Unknown error',
        circuitState: CircuitState.OPEN,
        failureCount: this.failureCount,
        timestamp: Date.now(),
      };

      this.logger.warn(
        `[${event.endpoint}] Circuit OPEN: ${this.failureCount} consecutive failures. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}. Error: ${event.errorMessage}`,
      );

      // Emit degraded event
      this.degradedSubject.next(event);
    }
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get the last sanitized endpoint.
   */
  getLastEndpoint(): string {
    return this.lastEndpoint;
  }

  /**
   * Get a cached value by key.
   */
  getCachedValue<T>(key: string): CachedValue<T> | undefined {
    return this.cache.get(key) as CachedValue<T> | undefined;
  }

  /**
   * Check if a cache key exists.
   */
  hasCachedValue(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Reset circuit breaker to closed state.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Clear all cached values.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Calculate exponential backoff delay.
   * Attempt 1: 500ms, Attempt 2: 1000ms, Attempt 3: 2000ms
   * With ±25% jitter.
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.options.baseDelayMs * Math.pow(2, attempt - 1);
    // Add jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, this.options.maxDelayMs);
  }

  /**
   * Sanitize endpoint URL by removing API key.
   */
  private sanitizeEndpoint(endpoint: string): string {
    if (!endpoint) return 'unknown';
    // Remove query params that look like API keys
    return endpoint.replace(/(\?|&)api-key=[^&]+/g, '$1api-key=***');
  }

  /**
   * Extract error code from an error object.
   */
  private extractErrorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      // HTTP status code
      if ('status' in error) return String((error as any).status);
      // gRPC / Solana error code
      if ('code' in error) return String((error as any).code);
      // Axios-style error
      if ('response' in error && (error as any).response?.status) {
        return String((error as any).response.status);
      }
    }
    return 'UNKNOWN';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
