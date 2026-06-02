import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramService],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 12345 },
        }),
      });

      const result = await service.sendMessage({
        chatId: '123456789',
        text: 'Hello from test',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('12345');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"chat_id":"123456789"'),
        }),
      );
    });

    it('should return error when bot token is not configured', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;

      const result = await service.sendMessage({
        chatId: '123456789',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bot token not configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle Telegram API error response', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden: bot was blocked by the user',
      });

      const result = await service.sendMessage({
        chatId: '123456789',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });

    it('should handle network errors', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await service.sendMessage({
        chatId: '123456789',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('should send message with HTML parse mode', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 67890 },
        }),
      });

      await service.sendMessage({
        chatId: '123456789',
        text: '<b>Bold text</b>',
        parseMode: 'HTML',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"parse_mode":"HTML"'),
        }),
      );
    });
  });

  describe('formatAlertNotification', () => {
    it('should format balance_low alert', () => {
      const message = service.formatAlertNotification({
        ruleType: 'balance_low',
        walletAddress: 'ABC123def456',
        chain: 'SOLANA',
        message: 'Balance 500000000 SOL is below threshold 1000000000',
      });

      expect(message).toContain('⚠️');
      expect(message).toContain('Alert Triggered');
      expect(message).toContain('balance_low');
      expect(message).toContain('SOLANA');
      expect(message).toContain('ABC123def456');
      expect(message).toContain('below threshold');
    });

    it('should format balance_high alert', () => {
      const message = service.formatAlertNotification({
        ruleType: 'balance_high',
        walletAddress: 'ABC123def456',
        chain: 'SOLANA',
        message: 'Balance is above threshold',
      });

      expect(message).toContain('📈');
    });

    it('should format transaction_from alert', () => {
      const message = service.formatAlertNotification({
        ruleType: 'transaction_from',
        walletAddress: 'ABC123def456',
        chain: 'SOLANA',
        message: 'Transaction from wallet',
      });

      expect(message).toContain('💸');
    });

    it('should format transaction_to alert', () => {
      const message = service.formatAlertNotification({
        ruleType: 'transaction_to',
        walletAddress: 'ABC123def456',
        chain: 'SOLANA',
        message: 'Transaction to wallet',
      });

      expect(message).toContain('💰');
    });

    it('should format token_volume alert', () => {
      const message = service.formatAlertNotification({
        ruleType: 'token_volume',
        walletAddress: 'ABC123def456',
        chain: 'SOLANA',
        message: 'Transaction amount exceeds threshold',
      });

      expect(message).toContain('📊');
    });

    it('should use default emoji for unknown type', () => {
      const message = service.formatAlertNotification({
        ruleType: 'unknown_type',
        walletAddress: 'ABC123def456',
        chain: 'SOLANA',
        message: 'Unknown alert',
      });

      expect(message).toContain('🔔');
    });
  });
});
