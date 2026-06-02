import { AlertRuleResponseDto } from '../alert-rule-response.dto';

describe('AlertRuleResponseDto', () => {
  it('should create an instance with all properties', () => {
    const dto = new AlertRuleResponseDto();
    dto.id = 'rule-1';
    dto.userId = 'user-1';
    dto.walletId = 'wallet-1';
    dto.chain = 'SOLANA';
    dto.type = 'balance_low';
    dto.threshold = '1000000000';
    dto.createdAt = new Date('2024-01-01');
    dto.updatedAt = new Date('2024-01-02');

    expect(dto.id).toBe('rule-1');
    expect(dto.userId).toBe('user-1');
    expect(dto.walletId).toBe('wallet-1');
    expect(dto.chain).toBe('SOLANA');
    expect(dto.type).toBe('balance_low');
    expect(dto.threshold).toBe('1000000000');
    expect(dto.createdAt).toBeInstanceOf(Date);
    expect(dto.updatedAt).toBeInstanceOf(Date);
  });

  it('should allow null threshold', () => {
    const dto = new AlertRuleResponseDto();
    dto.threshold = null;
    expect(dto.threshold).toBeNull();
  });
});
