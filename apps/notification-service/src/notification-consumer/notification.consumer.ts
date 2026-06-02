import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUES } from '@argus/shared-types';
import { TelegramService } from '../telegram/telegram.service';

/**
 * Payload for a notification:dispatch job.
 * Matches the QueueJobMap definition in @argus/shared-types.
 */
export interface NotificationDispatchData {
  alertId: string;
  walletId: string;
  channel: string;
  message: string;
}

/**
 * BullMQ consumer for notification:dispatch queue.
 * Receives triggered alert notifications and sends them via the appropriate channel.
 * Currently supports: 'telegram'
 * Retries with exponential backoff on failure.
 */
@Processor(QUEUES.NOTIFICATION_DISPATCH, {
  concurrency: 5,
  maxStalledCount: 3,
})
export class NotificationConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private readonly telegramService: TelegramService,
  ) {
    super();
  }

  /**
   * Process a notification:dispatch job.
   * Routes to the appropriate channel sender based on job data.
   */
  async process(job: Job<NotificationDispatchData>): Promise<{ success: boolean; channel: string; messageId?: string }> {
    const { alertId, walletId, channel, message } = job.data;

    this.logger.log(
      `Processing job ${job.id}: alert=${alertId}, wallet=${walletId}, channel=${channel}`,
    );

    switch (channel) {
      case 'telegram': {
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (!chatId) {
          this.logger.error('TELEGRAM_CHAT_ID is not set');
          throw new Error('Telegram chat ID not configured');
        }

        const result = await this.telegramService.sendMessage({
          chatId,
          text: message,
          parseMode: 'Markdown',
        });

        if (!result.success) {
          throw new Error(`Telegram send failed: ${result.error}`);
        }

        this.logger.log(`Notification sent via telegram for alert ${alertId}, messageId=${result.messageId}`);
        return { success: true, channel: 'telegram', messageId: result.messageId };
      }

      default:
        this.logger.error(`Unsupported notification channel: ${channel}`);
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);
  }
}
