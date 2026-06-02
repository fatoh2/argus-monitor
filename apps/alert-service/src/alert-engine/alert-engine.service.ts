import { Injectable, Logger } from '@nestjs/common';

export interface AlertRule {
  id: string;
  userId: string;
  walletId: string;
  chain: string;
  type: AlertRuleType;
  threshold?: string | null;
}

export type AlertRuleType = 'balance_low' | 'balance_high' | 'transaction_from' | 'transaction_to' | 'token_volume';

export interface BalanceData {
  balance: bigint;
  decimals: number;
  symbol: string;
}

export interface TransactionData {
  signature: string;
  from: string;
  to: string;
  amount: bigint;
  status: string;
}

export interface EvaluationResult {
  triggered: boolean;
  ruleId: string;
  ruleType: AlertRuleType;
  message?: string;
}

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  /**
   * Evaluate a single alert rule against current data.
   */
  evaluate(rule: AlertRule, data: BalanceData | TransactionData): EvaluationResult {
    switch (rule.type) {
      case 'balance_low':
        return this.evaluateBalanceLow(rule, data as BalanceData);
      case 'balance_high':
        return this.evaluateBalanceHigh(rule, data as BalanceData);
      case 'transaction_from':
        return this.evaluateTransactionFrom(rule, data as TransactionData);
      case 'transaction_to':
        return this.evaluateTransactionTo(rule, data as TransactionData);
      case 'token_volume':
        return this.evaluateTokenVolume(rule, data as TransactionData);
      default:
        this.logger.warn(`Unknown rule type: ${rule.type}`);
        return { triggered: false, ruleId: rule.id, ruleType: rule.type };
    }
  }

  /**
   * Evaluate multiple rules against the same data.
   */
  evaluateAll(rules: AlertRule[], data: BalanceData | TransactionData): EvaluationResult[] {
    return rules.map((rule) => this.evaluate(rule, data));
  }

  private evaluateBalanceLow(rule: AlertRule, data: BalanceData): EvaluationResult {
    if (!rule.threshold) {
      return { triggered: false, ruleId: rule.id, ruleType: rule.type };
    }

    const threshold = BigInt(rule.threshold);
    if (data.balance <= threshold) {
      return {
        triggered: true,
        ruleId: rule.id,
        ruleType: rule.type,
        message: `Balance ${data.balance} ${data.symbol} is below threshold ${threshold}`,
      };
    }

    return { triggered: false, ruleId: rule.id, ruleType: rule.type };
  }

  private evaluateBalanceHigh(rule: AlertRule, data: BalanceData): EvaluationResult {
    if (!rule.threshold) {
      return { triggered: false, ruleId: rule.id, ruleType: rule.type };
    }

    const threshold = BigInt(rule.threshold);
    if (data.balance >= threshold) {
      return {
        triggered: true,
        ruleId: rule.id,
        ruleType: rule.type,
        message: `Balance ${data.balance} ${data.symbol} is above threshold ${threshold}`,
      };
    }

    return { triggered: false, ruleId: rule.id, ruleType: rule.type };
  }

  private evaluateTransactionFrom(rule: AlertRule, data: TransactionData): EvaluationResult {
    // Check if the transaction is FROM the monitored wallet
    if (data.from === rule.walletId) {
      return {
        triggered: true,
        ruleId: rule.id,
        ruleType: rule.type,
        message: `Transaction from wallet ${rule.walletId}: ${data.signature}`,
      };
    }
    return { triggered: false, ruleId: rule.id, ruleType: rule.type };
  }

  private evaluateTransactionTo(rule: AlertRule, data: TransactionData): EvaluationResult {
    // Check if the transaction is TO the monitored wallet
    if (data.to === rule.walletId) {
      return {
        triggered: true,
        ruleId: rule.id,
        ruleType: rule.type,
        message: `Transaction to wallet ${rule.walletId}: ${data.signature}`,
      };
    }
    return { triggered: false, ruleId: rule.id, ruleType: rule.type };
  }

  private evaluateTokenVolume(rule: AlertRule, data: TransactionData): EvaluationResult {
    if (!rule.threshold) {
      return { triggered: false, ruleId: rule.id, ruleType: rule.type };
    }

    const threshold = BigInt(rule.threshold);
    if (data.amount >= threshold) {
      return {
        triggered: true,
        ruleId: rule.id,
        ruleType: rule.type,
        message: `Transaction amount ${data.amount} exceeds threshold ${threshold}`,
      };
    }

    return { triggered: false, ruleId: rule.id, ruleType: rule.type };
  }
}
