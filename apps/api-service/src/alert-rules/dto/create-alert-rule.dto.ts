import { IsString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateAlertRuleDto {
  @IsUUID()
  walletId: string;

  @IsString()
  @IsIn(['SOLANA', 'ETHEREUM'])
  chain: string;

  @IsString()
  @IsIn(['balance_low', 'balance_high', 'transaction_from', 'transaction_to'])
  type: string;

  @IsOptional()
  @IsString()
  threshold?: string;
}
