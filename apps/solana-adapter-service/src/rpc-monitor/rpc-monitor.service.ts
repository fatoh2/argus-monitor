import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { SolanaAdapter } from '../adapter/solana.adapter';
import { RpcHealthResult } from '@argus/shared-types';

/**
 * A snapshot of RPC health at a point in time.
 */
export interface RpcHealthSnapshot {
  endpoint: string;
  healthy: boolean;
  latencyMs: number;
  blockHeight: number;
  error?: string;
  timestamp: string; // ISO 8601
}

/**
 * Event emitted when RPC status changes (healthy ↔ unhealthy).
 */
export interface RpcStatusChangedEvent {
  endpoint: string;
  previous: RpcHealthSnapshot | null;
  current: RpcHealthSnapshot;
}

/**
 * Periodic RPC health monitor.
 *
 * - Polls configured RPC endpoints at a regular interval
 * - Stores health snapshots in memory (last N per endpoint)
 * - Emits `status_changed` events when health state toggles
 * - Logs all health transitions
 */
@Injectable()
export class RpcMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RpcMonitorService.name);

  /** How often to poll each endpoint (ms) */
  private readonly pollIntervalMs: number;

  /** Max snapshots to retain per endpoint */
  private readonly maxSnapshots: number;

  /** RPC endpoints to monitor */
  private readonly endpoints: string[];

  /** Snapshots keyed by endpoint (most recent first) */
  private readonly snapshots = new Map<string, RpcHealthSnapshot[]>();

  /** Last known health state per endpoint (for detecting changes) */
  private readonly lastKnownState = new Map<string, boolean>();

  /** Active interval timers keyed by endpoint */
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  /** Observable stream of status change events */
  private readonly statusChangedSubject = new Subject<RpcStatusChangedEvent>();
  readonly statusChanged$ = this.statusChangedSubject.asObservable();

  constructor(
    private readonly solanaAdapter: SolanaAdapter,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs = this.configService.get<number>(
      'rpcMonitor.pollIntervalMs',
      30_000,
    );
    this.maxSnapshots = this.configService.get<number>(
      'rpcMonitor.maxSnapshots',
      10,
    );

    // Read endpoints from config; fall back to the primary Helius RPC URL
    const configuredEndpoints = this.configService.get<string[]>(
      'rpcMonitor.endpoints',
      [],
    );
    if (configuredEndpoints.length > 0) {
      this.endpoints = configuredEndpoints;
    } else {
      const primaryUrl = this.configService.get<string>(
        'helius.rpcUrl',
        'https://api.mainnet-beta.solana.com',
      );
      this.endpoints = [primaryUrl];
    }
  }

  onModuleInit(): void {
    this.startMonitoring();
  }

  onModuleDestroy(): void {
    this.stopMonitoring();
  }

  /**
   * Start periodic health checks for all configured endpoints.
   */
  startMonitoring(): void {
    for (const endpoint of this.endpoints) {
      this.logger.log(
        `Starting RPC health monitoring for ${this.sanitizeEndpoint(endpoint)} every ${this.pollIntervalMs}ms`,
      );

      // Run an immediate check, then poll on interval
      this.checkEndpoint(endpoint);

      const timer = setInterval(() => {
        this.checkEndpoint(endpoint);
      }, this.pollIntervalMs);

      this.timers.set(endpoint, timer);
    }
  }

  /**
   * Stop all monitoring timers.
   */
  stopMonitoring(): void {
    for (const [endpoint, timer] of this.timers.entries()) {
      clearInterval(timer);
      this.logger.log(
        `Stopped RPC health monitoring for ${this.sanitizeEndpoint(endpoint)}`,
      );
    }
    this.timers.clear();
  }

  /**
   * Perform a single health check on an endpoint and store the snapshot.
   */
  async checkEndpoint(endpoint: string): Promise<RpcHealthSnapshot> {
    let result: RpcHealthResult;

    try {
      result = await this.solanaAdapter.checkRpcHealth(endpoint);
    } catch (error) {
      // Defensive: adapter should handle errors, but just in case
      result = {
        endpoint,
        healthy: false,
        latencyMs: 0,
        blockHeight: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const snapshot: RpcHealthSnapshot = {
      endpoint: result.endpoint,
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      blockHeight: result.blockHeight,
      error: result.error,
      timestamp: new Date().toISOString(),
    };

    this.storeSnapshot(snapshot);
    this.emitIfStatusChanged(snapshot);

    return snapshot;
  }

  /**
   * Store a health snapshot, keeping only the last N per endpoint.
   */
  private storeSnapshot(snapshot: RpcHealthSnapshot): void {
    const existing = this.snapshots.get(snapshot.endpoint) || [];
    existing.unshift(snapshot);

    // Trim to maxSnapshots
    if (existing.length > this.maxSnapshots) {
      existing.length = this.maxSnapshots;
    }

    this.snapshots.set(snapshot.endpoint, existing);
  }

  /**
   * Emit a status_changed event if health state toggled.
   */
  private emitIfStatusChanged(snapshot: RpcHealthSnapshot): void {
    const previousHealthy = this.lastKnownState.get(snapshot.endpoint);

    if (previousHealthy === undefined) {
      // First check — just record the state, no event
      this.lastKnownState.set(snapshot.endpoint, snapshot.healthy);
      this.logger.log(
        `[${this.sanitizeEndpoint(snapshot.endpoint)}] Initial health: ${snapshot.healthy ? 'healthy' : 'unhealthy'} ` +
          `(latency=${snapshot.latencyMs}ms, blockHeight=${snapshot.blockHeight})`,
      );
      return;
    }

    if (previousHealthy !== snapshot.healthy) {
      // State changed — emit event
      const snapshots = this.snapshots.get(snapshot.endpoint) || [];
      const previous = snapshots.length > 1 ? snapshots[1] : null;

      this.lastKnownState.set(snapshot.endpoint, snapshot.healthy);

      const event: RpcStatusChangedEvent = {
        endpoint: snapshot.endpoint,
        previous,
        current: snapshot,
      };

      this.statusChangedSubject.next(event);

      const newState = snapshot.healthy ? 'healthy' : 'unhealthy';
      const oldState = previousHealthy ? 'healthy' : 'unhealthy';
      this.logger.warn(
        `[${this.sanitizeEndpoint(snapshot.endpoint)}] Status changed: ${oldState} → ${newState} ` +
          `(latency=${snapshot.latencyMs}ms, blockHeight=${snapshot.blockHeight}${snapshot.error ? `, error=${snapshot.error}` : ''})`,
      );
    }
  }

  /**
   * Get all stored snapshots for an endpoint.
   */
  getSnapshots(endpoint: string): RpcHealthSnapshot[] {
    return this.snapshots.get(endpoint) || [];
  }

  /**
   * Get the latest snapshot for an endpoint, or null if none.
   */
  getLatestSnapshot(endpoint: string): RpcHealthSnapshot | null {
    const snapshots = this.snapshots.get(endpoint);
    return snapshots && snapshots.length > 0 ? snapshots[0] : null;
  }

  /**
   * Get all endpoints currently being monitored.
   */
  getMonitoredEndpoints(): string[] {
    return [...this.endpoints];
  }

  /**
   * Sanitize endpoint URL for logging (strip API keys).
   */
  private sanitizeEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      if (url.searchParams.has('api-key')) {
        url.searchParams.set('api-key', '***');
      }
      return url.toString();
    } catch {
      // If it's not a valid URL, just return as-is
      return endpoint;
    }
  }
}
