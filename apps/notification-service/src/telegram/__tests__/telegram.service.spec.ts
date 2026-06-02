import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramService],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  describe('formatAlertNotification', () => {
    it('should format a balance_low alert correctly', () => {
      const alert = {
        ruleType: 'balance_low',
        walletAddress: 'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
        chain: 'SOLANA',
        message: 'Balance 500000000 SOL is below threshold 1000000000',
      };

      const result = service.formatAlertNotification(alert);

      expect(result).toContain('⚠️');
      expect(result).toContain('*Alert Triggered*');
      expect(result).toContain('*Type:* balance_low');
      expect(result).toContain('*Chain:* SOLANA');
      expect(result).toContain('*Wallet:*');
      expect(result).toContain('Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1');
      expect(result).toContain('Balance 500000000 SOL is below threshold 1000000000');
    });

    it('should format a balance_high alert with correct emoji', () => {
      const alert = {
        ruleType: 'balance_high',
        walletAddress: 'wallet-abc',
        chain: 'SOLANA',
        message: 'Balance 2000000000 SOL is above threshold 1000000000',
      };

      const result = service.formatAlertNotification(alert);

      expect(result).toContain('📈');
      expect(result).toContain('*Type:* balance_high');
    });

    it('should format a transaction_from alert with correct emoji', () => {
      const alert = {
        ruleType: 'transaction_from',
        walletAddress: 'wallet-abc',
        chain: 'SOLANA',
        message: 'Transaction from wallet wallet-abc: sig-123',
      };

      const result = service.formatAlertNotification(alert);

      expect(result).toContain('💸');
      expect(result).toContain('*Type:* transaction_from');
    });

    it('should format a transaction_to alert with correct emoji', () => {
      const alert = {
        ruleType: 'transaction_to',
        walletAddress: 'wallet-abc',
        chain: 'SOLANA',
        message: 'Transaction to wallet wallet-abc: sig-456',
      };

      const result = service.formatAlertNotification(alert);

      expect(result).toContain('💰');
      expect(result).toContain('*Type:* transaction_to');
    });

    it('should format a token_volume alert with correct emoji', () => {
      const alert = {
        ruleType: 'token_volume',
        walletAddress: 'wallet-abc',
        chain: 'SOLANA',
        message: 'Transaction amount 2000000000 exceeds threshold 1000000000',
      };

      const result = service.formatAlertNotification(alert);

      expect(result).toContain('📊');
      expect(result).toContain('*Type:* token_volume');
    });

    it('should use default emoji for unknown rule type', () => {
      const alert = {
        ruleType: 'unknown_type',
        walletAddress: 'wallet-abc',
        chain: 'SOLANA',
        message: 'Some alert',
      };

      const result = service.formatAlertNotification(alert);

      expect(result).toContain('🔔');
    });
  });

  describe('sendMessage', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return error when TELEGRAM_BOT_TOKEN is not set', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;

      const result = await service.sendMessage({
        chatId: '12345',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bot token not configured');
    });

    it('should attempt to send when TELEGRAM_BOT_TOKEN is set', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';

      // Mock fetch to return success
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: { message_id: 42 },
        }),
      } as any);

      const result = await service.sendMessage({
        chatId: '12345',
        text: 'Hello',
        parseMode: 'Markdown',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('42');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"chat_id":"12345"'),
        }),
      );
    });

    it('should handle Telegram API error response', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Too Many Requests'),
      } as any);

      const result = await service.sendMessage({
        chatId: '12345',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Telegram API error');
    });

    it('should handle fetch throwing an error', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test-token';

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.sendMessage({
        chatId: '12345',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
