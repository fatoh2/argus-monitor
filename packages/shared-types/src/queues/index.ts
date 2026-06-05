/**
 * BullMQ queue names — single source of truth.
 * All services import from here; never hardcode queue names.
 */
export const QUEUES = {
  /** Scheduled job: "check wallet X now" */
  CHAIN_INDEXER: 'chain-indexer',
  /** Consumed by solana-adapter: fetch on-chain data */
  SOLANA_FETCH: 'solana-fetch',
  /** Consumed by alert-service: evaluate alert rules */
  ALERT_EVALUATION: 'alert-evaluation',
  /** Consumed by notification-service: send notifications */
  NOTIFICATION_DISPATCH: 'notification-dispatch',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Job payload types mapped to queue names.
 */
export interface QueueJobMap {
  [QUEUES.CHAIN_INDEXER]: {
    walletId: string;
    chainType: string;
    address: string;
  };
  [QUEUES.SOLANA_FETCH]: {
    walletId: string;
    address: string;
    monitorType: string;
  };
  [QUEUES.ALERT_EVALUATION]: {
    walletId: string;
    alertRuleId: string;
    currentValue: bigint;
    threshold: bigint;
    condition: string;
  };
  [QUEUES.NOTIFICATION_DISPATCH]: {
    alertId: string;
    walletId: string;
    channel: string;
    message: string;
  };
}
