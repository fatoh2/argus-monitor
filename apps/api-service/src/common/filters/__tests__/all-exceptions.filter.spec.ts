import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from '../all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockGetResponse: jest.Mock;
  let mockHttpAdapter: any;

  beforeEach(async () => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockGetResponse = jest.fn().mockReturnValue({
      status: mockStatus,
    });
    mockHttpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/test'),
    };

    filter = new AllExceptionsFilter({
      httpAdapter: mockHttpAdapter,
    } as any);
  });

  describe('HttpException handling', () => {
    it('should handle BadRequestException', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: mockStatus,
          }),
          getRequest: () => ({ url: '/test' }),
        }),
      } as unknown as ArgumentsHost;

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad request',
        }),
      );
    });

    it('should handle NotFoundException', () => {
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: mockStatus,
          }),
          getRequest: () => ({ url: '/test' }),
        }),
      } as unknown as ArgumentsHost;

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Not found',
        }),
      );
    });

    it('should handle exception with object response', () => {
      const exception = new HttpException(
        { message: ['email must be a valid email'] },
        HttpStatus.BAD_REQUEST,
      );
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: mockStatus,
          }),
          getRequest: () => ({ url: '/test' }),
        }),
      } as unknown as ArgumentsHost;

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['email must be a valid email'],
        }),
      );
    });
  });

  describe('Unknown exception handling', () => {
    it('should handle generic Error with its message in non-production mode', () => {
      // Save original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const exception = new Error('Something went wrong');
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: mockStatus,
          }),
          getRequest: () => ({ url: '/test' }),
        }),
      } as unknown as ArgumentsHost;

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Something went wrong',
          path: '/test',
        }),
      );

      // Restore
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should return generic message in production mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const exception = new Error('Something went wrong');
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: mockStatus,
          }),
          getRequest: () => ({ url: '/test' }),
        }),
      } as unknown as ArgumentsHost;

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }),
      );

      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
