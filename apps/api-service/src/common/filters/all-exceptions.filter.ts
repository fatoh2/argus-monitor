import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

interface ErrorResponse {
  statusCode: number;
  message: string;
  stack?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === 'production';

    // Determine status code and message
    let statusCode: number;
    let message: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof PrismaClientKnownRequestError) {
      // Map Prisma errors to HTTP status codes
      switch (exception.code) {
        case 'P2002':
          statusCode = HttpStatus.CONFLICT;
          message = 'Resource already exists';
          break;
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          message = 'Resource not found';
          break;
        default:
          statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Internal server error';
          break;
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    // Log 5xx errors with context
    if (statusCode >= 500) {
      const requestId = (request as any).requestId || 'unknown';
      const userId = (request as any).user?.id || 'anonymous';
      const stack = exception instanceof Error ? exception.stack : undefined;

      this.logger.error(
        `[${requestId}] [user:${userId}] ${request.method} ${request.url} - ${statusCode}: ${message}`,
        stack,
      );
    }

    // Build response body
    const errorResponse: ErrorResponse = {
      statusCode,
      message: Array.isArray(message) ? message[0] : message,
    };

    // Include stack trace in non-production environments
    if (!isProduction && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    response.status(statusCode).json(errorResponse);
  }
}
