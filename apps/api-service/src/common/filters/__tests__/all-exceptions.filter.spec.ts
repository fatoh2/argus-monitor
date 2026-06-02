import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '../all-exceptions.filter';
import { Response, Request } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { HttpAdapterHost } from '@nestjs/core';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockHost: ArgumentsHost;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;

  beforeEach(async () => {
    const mockHttpAdapter = {
      getRequestUrl: jest.fn(),
      getRequestMethod: jest.fn(),
      reply: jest.fn(),
      getType: jest.fn().mockReturnValue('express'),
    };

    const mockHttpAdapterHost = {
      httpAdapter: mockHttpAdapter,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: HttpAdapterHost,
          useValue: mockHttpAdapterHost,
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockRequest = {
      url: '/test',
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should catch an unhandled error and return 500 with no stack in production', () => {
    const error = new Error('Test error');
    process.env.NODE_ENV = 'production';

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
    // No extra fields in production
    expect(Object.keys((mockResponse.json as jest.Mock).mock.calls[0][0])).toEqual([
      'statusCode',
      'message',
    ]);
  });

  it('should catch an unhandled error and return 500 with stack in development', () => {
    const error = new Error('Test error');
    process.env.NODE_ENV = 'development';

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Test error',
      timestamp: expect.any(String),
      path: '/test',
      stack: expect.any(String),
    });
  });

  it('should catch an HttpException and return its status and message', () => {
    const httpException = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    process.env.NODE_ENV = 'development';

    filter.catch(httpException, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Forbidden',
      timestamp: expect.any(String),
      path: '/test',
      stack: expect.any(String),
    });
  });

  it('should map Prisma P2002 to 409 Conflict', () => {
    const prismaError = new PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
    process.env.NODE_ENV = 'development';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'Resource already exists.',
      timestamp: expect.any(String),
      path: '/test',
      stack: expect.any(String),
    });
  });

  it('should map Prisma P2025 to 404 Not Found', () => {
    const prismaError = new PrismaClientKnownRequestError(
      'Record not found',
      {
        code: 'P2025',
        clientVersion: 'test',
      },
    );
    process.env.NODE_ENV = 'development';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Resource not found.',
      timestamp: expect.any(String),
      path: '/test',
      stack: expect.any(String),
    });
  });

  it('should map Prisma P2003 to 400 Bad Request', () => {
    const prismaError = new PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: 'test',
      },
    );
    process.env.NODE_ENV = 'development';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Invalid foreign key.',
      timestamp: expect.any(String),
      path: '/test',
      stack: expect.any(String),
    });
  });

  it('should handle other Prisma errors as 500 Internal Server Error', () => {
    const prismaError = new PrismaClientKnownRequestError(
      'Some other Prisma error',
      {
        code: 'PXXX',
        clientVersion: 'test',
      },
    );
    process.env.NODE_ENV = 'development';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: expect.any(String),
      path: '/test',
      stack: expect.any(String),
    });
  });

  it('should return only statusCode and message in production for Prisma errors', () => {
    const prismaError = new PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
    process.env.NODE_ENV = 'production';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'Resource already exists.',
    });
    expect(Object.keys((mockResponse.json as jest.Mock).mock.calls[0][0])).toEqual([
      'statusCode',
      'message',
    ]);
  });
});
