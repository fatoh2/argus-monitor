import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { NotificationConsumer, NotificationDispatchData } from '../notification.consumer';
import { TelegramService } from '../../telegram/telegram.service';

describe('NotificationConsumer', () => {
  let consumer: NotificationConsumer;
  let telegramService: TelegramService;

  const mockJob = (data: NotificationDispatchData): Partial<Job<NotificationDispatchData>> => ({
    id: 'job-1',
    data,
    attemptsMade: 0,
    timestamp: Date.now(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        NotificationConsumer,
      ],
    }).compile();

    consumer = module.get<NotificationConsumer>(NotificationConsumer);
    telegramService = module.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe('process — telegram channel', () => {
    it('should send a notification via telegram successfully', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      process.env.TELEGRAM_CHAT_ID = 'test-chat-id';

      jest.spyOn(telegramService, 'sendMessage').mockResolvedValue({
        success: true,
        messageId: '12345',
      });

      const jobData: NotificationDispatchData = {
        alertId: 'alert-1',
        walletId: 'wallet-1',
        channel: 'telegram',
        message: '⚠️ *Alert Triggered*\n\n*Type:* balance_low\n*Chain:* SOLANA\n*Wallet:* `ABC123`\n\nBalance is below threshold',
      };

      const result = await consumer.process(mockJob(jobData) as Job<NotificationDispatchData>);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('telegram');
      expect(result.messageId).toBe('12345');
      expect(telegramService.sendMessage).toHaveBeenCalledWith({
        chatId: 'test-chat-id',
        text: jobData.message,
        parseMode: 'Markdown',
      });
    });

    it('should throw when TELEGRAM_CHAT_ID is not set', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      delete process.env.TELEGRAM_CHAT_ID;

      const jobData: NotificationDispatchData = {
        alertId: 'alert-1',
        walletId: 'wallet-1',
        channel: 'telegram',
        message: 'Test message',
      };

      await expect(
        consumer.process(mockJob(jobData) as Job<NotificationDispatchData>),
      ).rejects.toThrow('Telegram chat ID not configured');
    });

    it('should throw when telegram send fails', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      process.env.TELEGRAM_CHAT_ID = 'test-chat-id';

      jest.spyOn(telegramService, 'sendMessage').mockResolvedValue({
        success: false,
        error: 'Telegram API error: 403',
      });

      const jobData: NotificationDispatchData = {
        alertId: 'alert-1',
        walletId: 'wallet-1',
        channel: 'telegram',
        message: 'Test message',
      };

      await expect(
        consumer.process(mockJob(jobData) as Job<NotificationDispatchData>),
      ).rejects.toThrow('Telegram send failed: Telegram API error: 403');
    });
  });

  describe('process — unsupported channel', () => {
    it('should throw for unsupported channel', async () => {
      const jobData: NotificationDispatchData = {
        alertId: 'alert-1',
        walletId: 'wallet-1',
        channel: 'email',
        message: 'Test message',
      };

      await expect(
        consumer.process(mockJob(jobData) as Job<NotificationDispatchData>),
      ).rejects.toThrow('Unsupported channel: email');
    });
  });
});
