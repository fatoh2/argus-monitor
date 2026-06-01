import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { IsString, IsEmail, IsIn, IsNotEmpty, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// Minimal test DTOs matching the real ones
class TestCreateWalletDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsIn(['SOLANA', 'ETHEREUM'])
  chain: string;
}

class TestRegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class TestPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

describe('ValidationPipe (global config)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  describe('forbidNonWhitelisted', () => {
    it('should throw BadRequestException for unknown properties', async () => {
      const input = { address: 'ABC123', chain: 'SOLANA', extraField: 'shouldFail' };
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: TestCreateWalletDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('whitelist (without forbidNonWhitelisted)', () => {
    const whitelistOnlyPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    });

    it('should strip unknown properties', async () => {
      const input = { address: 'ABC123', chain: 'SOLANA', extraField: 'shouldBeStripped' };
      const result = await whitelistOnlyPipe.transform(input, {
        type: 'body',
        metatype: TestCreateWalletDto,
      });
      expect(result).toEqual({ address: 'ABC123', chain: 'SOLANA' });
      expect((result as any).extraField).toBeUndefined();
    });
  });

  describe('CreateWalletDto validation', () => {
    it('should accept valid wallet payload', async () => {
      const input = { address: 'ABC123def456', chain: 'SOLANA' };
      const result = await pipe.transform(input, {
        type: 'body',
        metatype: TestCreateWalletDto,
      });
      expect(result).toEqual(input);
    });

    it('should reject empty address', async () => {
      const input = { address: '', chain: 'SOLANA' };
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: TestCreateWalletDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid chain', async () => {
      const input = { address: 'ABC123', chain: 'BITCOIN' };
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: TestCreateWalletDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty body {}', async () => {
      const input = {};
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: TestCreateWalletDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('RegisterDto validation', () => {
    it('should accept valid registration payload', async () => {
      const input = { email: 'test@example.com', password: 'password123' };
      const result = await pipe.transform(input, {
        type: 'body',
        metatype: TestRegisterDto,
      });
      expect(result).toEqual(input);
    });

    it('should reject invalid email', async () => {
      const input = { email: 'not-an-email', password: 'password123' };
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: TestRegisterDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject missing password', async () => {
      const input = { email: 'test@example.com' };
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: TestRegisterDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PaginationDto transform', () => {
    it('should transform string query params to numbers', async () => {
      const input = { page: '2', limit: '50' };
      const result = await pipe.transform(input, {
        type: 'query',
        metatype: TestPaginationDto,
      });
      expect(typeof result.page).toBe('number');
      expect(typeof result.limit).toBe('number');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should apply defaults for missing optional params', async () => {
      const input = {};
      const result = await pipe.transform(input, {
        type: 'query',
        metatype: TestPaginationDto,
      });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should reject page < 1', async () => {
      const input = { page: '0' };
      await expect(
        pipe.transform(input, {
          type: 'query',
          metatype: TestPaginationDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject limit > 100', async () => {
      const input = { limit: '200' };
      await expect(
        pipe.transform(input, {
          type: 'query',
          metatype: TestPaginationDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
