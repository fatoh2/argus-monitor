import { WalletResponseDto } from '../wallet-response.dto';

describe('WalletResponseDto', () => {
  it('should create an instance with all properties', () => {
    const dto = new WalletResponseDto();
    dto.id = 'wallet-1';
    dto.address = 'ABC123def456';
    dto.chain = 'SOLANA';
    dto.userId = 'user-1';
    dto.createdAt = new Date('2024-01-01');
    dto.updatedAt = new Date('2024-01-02');

    expect(dto.id).toBe('wallet-1');
    expect(dto.address).toBe('ABC123def456');
    expect(dto.chain).toBe('SOLANA');
    expect(dto.userId).toBe('user-1');
    expect(dto.createdAt).toBeInstanceOf(Date);
    expect(dto.updatedAt).toBeInstanceOf(Date);
  });
});
