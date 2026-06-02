import { Test, TestingModule } from '@nestjs/testing';
import { AlertEngineService, AlertRule, BalanceData, TransactionData } from '../alert-engine.service';

describe('AlertEngineService', () => {
  let service: AlertEngineService;

  const baseRule: AlertRule = {
    id: 'rule-1',
    userId: 'user-1',
    walletId: 'wallet-1',
    chain: 'SOLANA',
    type: 'balance_low',
    threshold: '1000000000', // 1 SOL in lamports
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertEngineService],
    }).compile();

    service = module.get<AlertEngineService>(AlertEngineService);
  });

  describe('evaluate — balance_low', () => {
    it('should trigger when balance is below threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_low', threshold: '1000000000' };
      const data: BalanceData = { balance: BigInt(500000000), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.ruleId).toBe('rule-1');
      expect(result.message).toContain('below threshold');
    });

    it('should trigger when balance equals threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_low', threshold: '1000000000' };
      const data: BalanceData = { balance: BigInt(1000000000), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
    });

    it('should not trigger when balance is above threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_low', threshold: '1000000000' };
      const data: BalanceData = { balance: BigInt(2000000000), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });

    it('should not trigger when threshold is not set', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_low', threshold: null };
      const data: BalanceData = { balance: BigInt(0), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('evaluate — balance_high', () => {
    it('should trigger when balance is above threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_high', threshold: '1000000000' };
      const data: BalanceData = { balance: BigInt(5000000000), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('above threshold');
    });

    it('should trigger when balance equals threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_high', threshold: '1000000000' };
      const data: BalanceData = { balance: BigInt(1000000000), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
    });

    it('should not trigger when balance is below threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_high', threshold: '1000000000' };
      const data: BalanceData = { balance: BigInt(500000000), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });

    it('should not trigger when threshold is not set', () => {
      const rule: AlertRule = { ...baseRule, type: 'balance_high', threshold: null };
      const data: BalanceData = { balance: BigInt(999999999999), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('evaluate — transaction_from', () => {
    it('should trigger when transaction is from the monitored wallet', () => {
      const rule: AlertRule = { ...baseRule, type: 'transaction_from' };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'wallet-1',
        to: 'other-wallet',
        amount: BigInt(100000000),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('Transaction from wallet');
    });

    it('should not trigger when transaction is from another wallet', () => {
      const rule: AlertRule = { ...baseRule, type: 'transaction_from' };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'other-wallet',
        to: 'wallet-1',
        amount: BigInt(100000000),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('evaluate — transaction_to', () => {
    it('should trigger when transaction is to the monitored wallet', () => {
      const rule: AlertRule = { ...baseRule, type: 'transaction_to' };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'other-wallet',
        to: 'wallet-1',
        amount: BigInt(100000000),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('Transaction to wallet');
    });

    it('should not trigger when transaction is to another wallet', () => {
      const rule: AlertRule = { ...baseRule, type: 'transaction_to' };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'wallet-1',
        to: 'other-wallet',
        amount: BigInt(100000000),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('evaluate — token_volume', () => {
    it('should trigger when amount exceeds threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'token_volume', threshold: '1000000000' };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'wallet-1',
        to: 'other-wallet',
        amount: BigInt(5000000000),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('exceeds threshold');
    });

    it('should not trigger when amount is below threshold', () => {
      const rule: AlertRule = { ...baseRule, type: 'token_volume', threshold: '1000000000' };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'wallet-1',
        to: 'other-wallet',
        amount: BigInt(500000000),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });

    it('should not trigger when threshold is not set', () => {
      const rule: AlertRule = { ...baseRule, type: 'token_volume', threshold: null };
      const data: TransactionData = {
        signature: 'sig1',
        from: 'wallet-1',
        to: 'other-wallet',
        amount: BigInt(999999999999),
        status: 'success',
      };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
    });
  });

  describe('evaluate — unknown type', () => {
    it('should return not triggered for unknown rule type', () => {
      const rule: AlertRule = { ...baseRule, type: 'unknown_type' as any };
      const data: BalanceData = { balance: BigInt(0), decimals: 9, symbol: 'SOL' };

      const result = service.evaluate(rule, data);

      expect(result.triggered).toBe(false);
      expect(result.ruleId).toBe('rule-1');
    });
  });

  describe('evaluateAll', () => {
    it('should evaluate multiple rules against the same data', () => {
      const rules: AlertRule[] = [
        { ...baseRule, id: 'rule-1', type: 'balance_low', threshold: '1000000000' },
        { ...baseRule, id: 'rule-2', type: 'balance_high', threshold: '5000000000' },
        { ...baseRule, id: 'rule-3', type: 'transaction_from' },
      ];

      const data: BalanceData = { balance: BigInt(2000000000), decimals: 9, symbol: 'SOL' };

      const results = service.evaluateAll(rules, data);

      expect(results).toHaveLength(3);
      expect(results[0].triggered).toBe(false); // balance_low: 2 SOL > 1 SOL threshold
      expect(results[1].triggered).toBe(false); // balance_high: 2 SOL < 5 SOL threshold
      expect(results[2].triggered).toBe(false); // transaction_from: not a transaction
    });
  });
});
