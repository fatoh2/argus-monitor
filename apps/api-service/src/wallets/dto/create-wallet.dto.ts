import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsIn(['SOLANA', 'ETHEREUM'])
  chain: string;
}
