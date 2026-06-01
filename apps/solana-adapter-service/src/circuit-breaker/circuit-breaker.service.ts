import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

/**
 * Circuit breaker pattern to prevent cascading failures.
 * Stops calling the RPC when failures exceed threshold,
 * then periodically tests if the service has recovered.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  /**
   * Execute a function with circuit breaker protection.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.logger.log(
          'Circuit half-open: testing if service has recovered',
        );
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error(
          `Circuit breaker is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call.
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.logger.log('Circuit closed: service has recovered');
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
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.failureCount >= this.options.failureThreshold &&
      this.state === CircuitState.CLOSED
    ) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime =
        Date.now() + this.options.timeoutMs;
      this.logger.warn(
        `Circuit opened: ${this.failureCount} consecutive failures. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`,
      );
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
   * Reset circuit breaker to closed state.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}
