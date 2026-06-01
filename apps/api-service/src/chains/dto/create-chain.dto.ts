import { IsString, IsUrl, IsNotEmpty } from 'class-validator';

export class CreateChainDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsUrl()
  rpcUrl: string;
}
