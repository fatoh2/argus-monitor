import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUES } from '@argus/shared-types';
import { AlertEngineService, AlertRule, BalanceData, TransactionData } from '../alert-engine/alert-engine.service';

/**
 * Redact sensitive fields from loggable data.
 */
function redactLogData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (['password', 'token', 'secret', 'privatekey', 'private_key', 'apikey', 'api_key', 'mnemonic', 'seedphrase'].includes(lowerKey)) {
      result[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactLogData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Payload for an alert:evaluation job.
 * Carries the data to evaluate and the rules to check against.
 */
export interface AlertEvaluationJobData {
  /** The wallet being evaluated */
  walletId: string;
  /** Chain identifier */
  chain: string;
  /** Type of data being evaluated */
  dataType: 'balance' | 'transaction';
  /** The balance or transaction data */
  data: Record<string, unknown>;
  /** Alert rules to evaluate against */
  rules: AlertRule[];
}

/**
 * Payload for a notification:dispatch job.
 */
export interface NotificationDispatchData {
  alertId: string;
  walletId: string;
  channel: string;
  message: string;
  ruleType: string;
  chain: string;
}

/**
 * BullMQ consumer for alert:evaluation queue.
 * Receives balance/transaction data, evaluates alert rules,
 * and pushes triggered alerts to the notification:dispatch queue.
 */
@Processor(QUEUES.ALERT_EVALUATION)
export class AlertConsumer extends WorkerHost {
  private readonly logger = new Logger(AlertConsumer.name);

  constructor(
    private readonly alertEngineService: AlertEngineService,
    @InjectQueue(QUEUES.NOTIFICATION_DISPATCH) private readonly notificationQueue: Queue,
  ) {
    super();
  }

  /**
   * Process an alert:evaluation job.
   * Evaluates all rules against the provided data and emits triggered alerts.
   */
  async process(job: Job<AlertEvaluationJobData>): Promise<{
    evaluated: number;
    triggered: number;
    results: Array<{ ruleId: string; ruleType: string; triggered: boolean; message?: string }>;
  }> {
    const { walletId, chain, dataType, data, rules } = job.data;

    this.logger.log(
      `Processing job ${job.id}: wallet=${walletId}, chain=${chain}, type=${dataType}, rules=${rules.length}`,
    );

    if (!rules || rules.length === 0) {
      this.logger.warn(`No rules to evaluate for wallet ${walletId}`);
      return { evaluated: 0, triggered: 0, results: [] };
    }

    try {
      // Convert raw data to typed data based on dataType
      const typedData = this.toTypedData(dataType, data);

      // Evaluate all rules
      const results = this.alertEngineService.evaluateAll(rules, typedData);

      // Filter triggered alerts
      const triggered = results.filter((r) => r.triggered);

      this.logger.log(
        `Evaluation complete: ${results.length} evaluated, ${triggered.length} triggered for wallet ${walletId}`,
      );

      // Push each triggered alert to the notification-dispatch queue
      for (const r of triggered) {
        await this.notificationQueue.add('dispatch', {
          alertId: r.ruleId,
          walletId,
          channel: 'telegram',
          message: r.message ?? `Alert ${r.ruleType} triggered for wallet ${walletId}`,
          ruleType: r.ruleType,
          chain,
        });
      }
      if (triggered.length > 0) {
        this.logger.log(`Dispatched ${triggered.length} notification(s) to queue for wallet ${walletId}`);
      }

      return {
        evaluated: results.length,
        triggered: triggered.length,
        results: results.map((r) => ({
          ruleId: r.ruleId,
          ruleType: r.ruleType,
          triggered: r.triggered,
          message: r.message,
        })),
      };
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Convert raw Record data to typed BalanceData or TransactionData.
   */
  private toTypedData(
    dataType: 'balance' | 'transaction',
    data: Record<string, unknown>,
  ): BalanceData | TransactionData {
    if (dataType === 'balance') {
      return {
        balance: BigInt(String(data.balance ?? '0')),
        decimals: Number(data.decimals ?? 0),
        symbol: String(data.symbol ?? ''),
      };
    }

    return {
      signature: String(data.signature ?? ''),
      from: String(data.from ?? ''),
      to: String(data.to ?? ''),
      amount: BigInt(String(data.amount ?? '0')),
      status: String(data.status ?? ''),
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
