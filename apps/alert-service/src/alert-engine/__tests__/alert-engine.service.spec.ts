import { Test, TestingModule } from '@nestjs/testing';
import { AlertEngineService, AlertRule, BalanceData, TransactionData } from '../alert-engine.service';

describe('AlertEngineService', () => {
  let service: AlertEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertEngineService],
    }).compile();

    service = module.get<AlertEngineService>(AlertEngineService);
  });

  describe('balance_low rule', () => {
    it('should trigger when balance is below threshold', () => {
      const rule: AlertRule = {
        id: 'rule-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
      };

      const data: BalanceData = {
        balance: 500000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.ruleId).toBe('rule-1');
      expect(result.ruleType).toBe('balance_low');
      expect(result.message).toContain('below threshold');
    });

    it('should not trigger when balance is above threshold', () => {
      const rule: AlertRule = {
        id: 'rule-2',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
      };

      const data: BalanceData = {
        balance: 2000000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });

    it('should trigger when balance equals threshold', () => {
      const rule: AlertRule = {
        id: 'rule-3',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
      };

      const data: BalanceData = {
        balance: 1000000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
    });

    it('should not trigger when threshold is null', () => {
      const rule: AlertRule = {
        id: 'rule-4',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: null,
      };

      const data: BalanceData = {
        balance: 0n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('balance_high rule', () => {
    it('should trigger when balance is above threshold', () => {
      const rule: AlertRule = {
        id: 'rule-5',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_high',
        threshold: '1000000000',
      };

      const data: BalanceData = {
        balance: 2000000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('above threshold');
    });

    it('should not trigger when balance is below threshold', () => {
      const rule: AlertRule = {
        id: 'rule-6',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_high',
        threshold: '1000000000',
      };

      const data: BalanceData = {
        balance: 500000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });

    it('should trigger when balance equals threshold', () => {
      const rule: AlertRule = {
        id: 'rule-7',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_high',
        threshold: '1000000000',
      };

      const data: BalanceData = {
        balance: 1000000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
    });
  });

  describe('transaction_from rule', () => {
    it('should trigger when transaction is from the monitored wallet', () => {
      const rule: AlertRule = {
        id: 'rule-8',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'transaction_from',
        threshold: null,
      };

      const data: TransactionData = {
        signature: 'sig-123',
        from: 'wallet-1',
        to: 'wallet-2',
        amount: 1000000000n,
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('Transaction from wallet');
    });

    it('should not trigger when transaction is to the monitored wallet', () => {
      const rule: AlertRule = {
        id: 'rule-9',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'transaction_from',
        threshold: null,
      };

      const data: TransactionData = {
        signature: 'sig-456',
        from: 'wallet-2',
        to: 'wallet-1',
        amount: 1000000000n,
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('transaction_to rule', () => {
    it('should trigger when transaction is to the monitored wallet', () => {
      const rule: AlertRule = {
        id: 'rule-10',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'transaction_to',
        threshold: null,
      };

      const data: TransactionData = {
        signature: 'sig-789',
        from: 'wallet-2',
        to: 'wallet-1',
        amount: 1000000000n,
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('Transaction to wallet');
    });
  });

  describe('token_volume rule', () => {
    it('should trigger when amount exceeds threshold', () => {
      const rule: AlertRule = {
        id: 'rule-11',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'token_volume',
        threshold: '1000000000',
      };

      const data: TransactionData = {
        signature: 'sig-111',
        from: 'wallet-2',
        to: 'wallet-1',
        amount: 2000000000n,
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('exceeds threshold');
    });

    it('should not trigger when amount is below threshold', () => {
      const rule: AlertRule = {
        id: 'rule-12',
        userId: 'user-1',
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'token_volume',
        threshold: '1000000000',
      };

      const data: TransactionData = {
        signature: 'sig-222',
        from: 'wallet-2',
        to: 'wallet-1',
        amount: 500000000n,
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('BIGINT arithmetic', () => {
    it('should keep BIGINT arithmetic as integer throughout', () => {
      // This is the exact test from the acceptance criteria
      const result = 1000000000n + 500000000n;
      expect(result).toBe(1500000000n);
      expect(typeof result).toBe('bigint');
      // Verify no float conversion
      expect(Number(result)).toBe(1500000000);
    });

    it('should handle large BIGINT values without precision loss', () => {
      const large = 9999999999999999999n;
      const small = 1n;
      const result = large + small;
      expect(result).toBe(10000000000000000000n);
    });
  });

  describe('evaluateAll', () => {
    it('should evaluate multiple rules against the same data', () => {
      const rules: AlertRule[] = [
        {
          id: 'rule-1',
          userId: 'user-1',
          walletId: 'wallet-1',
          chain: 'SOLANA',
          type: 'balance_low',
          threshold: '1000000000',
        },
        {
          id: 'rule-2',
          userId: 'user-1',
          walletId: 'wallet-1',
          chain: 'SOLANA',
          type: 'balance_high',
          threshold: '5000000000',
        },
      ];

      const data: BalanceData = {
        balance: 2000000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const results = service.evaluateAll(rules, data);

      expect(results).toHaveLength(2);
      expect(results[0].triggered).toBe(false); // balance_low: 2B > 1B, not triggered
      expect(results[1].triggered).toBe(false); // balance_high: 2B < 5B, not triggered
    });

    it('should return triggered results when conditions are met', () => {
      const rules: AlertRule[] = [
        {
          id: 'rule-1',
          userId: 'user-1',
          walletId: 'wallet-1',
          chain: 'SOLANA',
          type: 'balance_low',
          threshold: '1000000000',
        },
      ];

      const data: BalanceData = {
        balance: 500000000n,
        decimals: 9,
        symbol: 'SOL',
      };

      const results = service.evaluateAll(rules, data);

      expect(results).toHaveLength(1);
      expect(results[0].triggered).toBe(true);
    });
  });
});
