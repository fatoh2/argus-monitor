import { Injectable, Logger } from '@nestjs/common';

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly baseUrl = 'https://api.telegram.org';

  constructor() {}

  /**
   * Send a message via Telegram Bot API.
   * Uses the bot token from environment variable TELEGRAM_BOT_TOKEN.
   */
  async sendMessage(message: TelegramMessage): Promise<NotificationResult> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      this.logger.error('TELEGRAM_BOT_TOKEN is not set');
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      const url = `${this.baseUrl}/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.text,
          parse_mode: message.parseMode || 'Markdown',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Telegram API error: ${response.status} ${errorBody}`);
        return { success: false, error: `Telegram API error: ${response.status}` };
      }

      const result = await response.json();
      return {
        success: true,
        messageId: result.result?.message_id?.toString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send Telegram message: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Format an alert notification as a Telegram message.
   */
  formatAlertNotification(alert: {
    ruleType: string;
    walletAddress: string;
    chain: string;
    message: string;
  }): string {
    const emoji = this.getAlertEmoji(alert.ruleType);
    return [
      `${emoji} *Alert Triggered*`,
      '',
      `*Type:* ${alert.ruleType}`,
      `*Chain:* ${alert.chain}`,
      `*Wallet:* \`${alert.walletAddress}\``,
      '',
      alert.message,
    ].join('\n');
  }

  private getAlertEmoji(ruleType: string): string {
    switch (ruleType) {
      case 'balance_low':
        return '⚠️';
      case 'balance_high':
        return '📈';
      case 'transaction_from':
        return '💸';
      case 'transaction_to':
        return '💰';
      case 'token_volume':
        return '📊';
      default:
        return '🔔';
    }
  }
}
