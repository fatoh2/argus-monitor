import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { AlertConsumer, AlertEvaluationJobData } from '../alert.consumer';
import { AlertEngineService, AlertRule } from '../../alert-engine/alert-engine.service';

describe('AlertConsumer', () => {
  let consumer: AlertConsumer;
  let alertEngineService: AlertEngineService;

  const baseRule: AlertRule = {
    id: 'rule-1',
    userId: 'user-1',
    walletId: 'wallet-1',
    chain: 'SOLANA',
    type: 'token_volume',
    threshold: '1000000000', // 1 SOL in lamports
  };

  const mockJob = (data: AlertEvaluationJobData): Partial<Job<AlertEvaluationJobData>> => ({
    id: 'job-1',
    data,
    attemptsMade: 0,
    timestamp: Date.now(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertEngineService,
        AlertConsumer,
      ],
    }).compile();

    consumer = module.get<AlertConsumer>(AlertConsumer);
    alertEngineService = module.get<AlertEngineService>(AlertEngineService);
  });

  describe('process — balance data', () => {
    it('should trigger token_volume rule when large transaction is evaluated', async () => {
      const rules: AlertRule[] = [
        { ...baseRule, type: 'token_volume', threshold: '1000000000' },
      ];

      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'transaction',
        data: {
          signature: 'tx-sig-1',
          from: 'wallet-1',
          to: 'wallet-2',
          amount: '5000000000', // 5 SOL — exceeds threshold
          status: 'success',
        },
        rules,
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(1);
      expect(result.triggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
      expect(result.results[0].ruleId).toBe('rule-1');
      expect(result.results[0].message).toContain('exceeds threshold');
    });

    it('should not trigger when transaction is below threshold', async () => {
      const rules: AlertRule[] = [
        { ...baseRule, type: 'token_volume', threshold: '1000000000' },
      ];

      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'transaction',
        data: {
          signature: 'tx-sig-2',
          from: 'wallet-1',
          to: 'wallet-2',
          amount: '500000000', // 0.5 SOL — below threshold
          status: 'success',
        },
        rules,
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(1);
      expect(result.triggered).toBe(0);
      expect(result.results[0].triggered).toBe(false);
    });

    it('should trigger balance_low rule when balance is low', async () => {
      const rules: AlertRule[] = [
        { ...baseRule, type: 'balance_low', threshold: '1000000000' },
      ];

      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'balance',
        data: {
          balance: '500000000', // 0.5 SOL — below threshold
          decimals: 9,
          symbol: 'SOL',
        },
        rules,
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(1);
      expect(result.triggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
      expect(result.results[0].message).toContain('below threshold');
    });

    it('should trigger transaction_from rule', async () => {
      const rules: AlertRule[] = [
        { ...baseRule, type: 'transaction_from' },
      ];

      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'transaction',
        data: {
          signature: 'tx-sig-3',
          from: 'wallet-1',
          to: 'wallet-2',
          amount: '100000000',
          status: 'success',
        },
        rules,
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(1);
      expect(result.triggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
      expect(result.results[0].message).toContain('Transaction from wallet');
    });
  });

  describe('process — edge cases', () => {
    it('should handle empty rules list', async () => {
      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'balance',
        data: { balance: '1000000000', decimals: 9, symbol: 'SOL' },
        rules: [],
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(0);
      expect(result.triggered).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should handle multiple rules with mixed results', async () => {
      const rules: AlertRule[] = [
        { ...baseRule, id: 'rule-1', type: 'balance_low', threshold: '1000000000' },
        { ...baseRule, id: 'rule-2', type: 'balance_high', threshold: '5000000000' },
        { ...baseRule, id: 'rule-3', type: 'transaction_from' },
      ];

      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'balance',
        data: { balance: '2000000000', decimals: 9, symbol: 'SOL' },
        rules,
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(3);
      expect(result.results[0].triggered).toBe(false); // balance_low: 2 > 1
      expect(result.results[1].triggered).toBe(false); // balance_high: 2 < 5
      expect(result.results[2].triggered).toBe(false); // transaction_from: not tx data
    });

    it('should handle missing optional fields in data', async () => {
      const rules: AlertRule[] = [
        { ...baseRule, type: 'token_volume', threshold: '1000000000' },
      ];

      const jobData: AlertEvaluationJobData = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        dataType: 'transaction',
        data: {
          signature: 'tx-sig-4',
          from: 'wallet-1',
          to: 'wallet-2',
          // amount missing — should default to 0
          status: 'success',
        },
        rules,
      };

      const result = await consumer.process(mockJob(jobData) as Job<AlertEvaluationJobData>);

      expect(result.evaluated).toBe(1);
      expect(result.triggered).toBe(0);
    });
  });
});
