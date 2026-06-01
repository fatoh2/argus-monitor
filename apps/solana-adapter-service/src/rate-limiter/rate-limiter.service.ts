import { Injectable, Logger } from '@nestjs/common';

export interface RateLimiterOptions {
  maxRequestsPerSecond: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Token bucket rate limiter with exponential backoff retry.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(private readonly options: RateLimiterOptions) {
    this.maxTokens = options.maxRequestsPerSecond;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = this.maxTokens / 1000; // refill over 1 second
  }

  /**
   * Execute a function with rate limiting and exponential backoff.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.calculateBackoff(attempt);
        this.logger.warn(
          `Rate limiter retry attempt ${attempt}/${this.options.maxRetries} after ${delay}ms`,
        );
        await this.sleep(delay);
      }

      await this.waitForToken();

      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on 4xx errors (client errors) except 429 (rate limited)
        if (error instanceof Error && 'status' in error) {
          const status = (error as any).status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw error;
          }
        }

        if (attempt >= this.options.maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Rate limiter: max retries exceeded');
  }

  /**
   * Wait for a token to be available.
   */
  private async waitForToken(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Wait for next token
    const waitTime = Math.ceil(1000 / this.maxTokens);
    await this.sleep(waitTime);
    return this.waitForToken();
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Calculate exponential backoff delay.
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.options.baseDelayMs * Math.pow(2, attempt - 1);
    // Add jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, this.options.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
