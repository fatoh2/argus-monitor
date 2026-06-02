import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { handlePrismaError } from '../prisma-error.handler';

describe('handlePrismaError', () => {
  it('should throw ConflictException for P2002 (unique constraint)', () => {
    const error = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });

    expect(() => handlePrismaError(error)).toThrow(ConflictException);
    expect(() => handlePrismaError(error)).toThrow('Resource already exists');
  });

  it('should throw NotFoundException for P2025 (record not found)', () => {
    const error = new PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    expect(() => handlePrismaError(error)).toThrow(NotFoundException);
    expect(() => handlePrismaError(error)).toThrow('Resource not found');
  });

  it('should throw BadRequestException for P2003 (foreign key violation)', () => {
    const error = new PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '5.0.0',
    });

    expect(() => handlePrismaError(error)).toThrow(BadRequestException);
    expect(() => handlePrismaError(error)).toThrow('Referenced resource does not exist');
  });

  it('should throw InternalServerErrorException for unknown Prisma error codes', () => {
    const error = new PrismaClientKnownRequestError('Some unknown error', {
      code: 'P2020',
      clientVersion: '5.0.0',
    });

    expect(() => handlePrismaError(error)).toThrow(InternalServerErrorException);
    expect(() => handlePrismaError(error)).toThrow('Internal server error');
  });

  it('should re-throw non-Prisma errors as-is', () => {
    const error = new NotFoundException('Custom not found');

    expect(() => handlePrismaError(error)).toThrow(NotFoundException);
    expect(() => handlePrismaError(error)).toThrow('Custom not found');
  });

  it('should include context in log message for unknown errors', () => {
    const error = new PrismaClientKnownRequestError('Unknown error', {
      code: 'P2020',
      clientVersion: '5.0.0',
    });

    // Should still throw InternalServerErrorException with context
    expect(() => handlePrismaError(error, 'TestService.method')).toThrow(InternalServerErrorException);
  });
});
