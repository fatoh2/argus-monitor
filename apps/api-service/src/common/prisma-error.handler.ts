import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const logger = new Logger('PrismaErrorHandler');

/**
 * Maps Prisma known request errors to NestJS HTTP exceptions.
 *
 * Use this helper to wrap Prisma calls in service methods for
 * consistent, clean error responses.
 *
 * @param error - The caught error
 * @param context - Optional context string for logging (e.g., method name)
 * @throws NestJS HTTP exception based on the Prisma error code
 */
export function handlePrismaError(error: unknown, context?: string): never {
  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        throw new ConflictException('Resource already exists');
      case 'P2025':
        // Record not found
        throw new NotFoundException('Resource not found');
      case 'P2003':
        // Foreign key constraint violation
        throw new BadRequestException('Referenced resource does not exist');
      default:
        // Log unexpected Prisma errors with full context
        logger.error(
          `Unhandled Prisma error [${error.code}]${context ? ` in ${context}` : ''}: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException('Internal server error');
    }
  }

  // Re-throw non-Prisma errors as-is (they should already be HTTP exceptions)
  throw error;
}
