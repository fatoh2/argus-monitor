import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let mockResponse: Partial<Response>;
  let app: INestApplication;

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{
          ttl: 60000,
          limit: 10,
        }]),
      ],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refreshToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
          },
        },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a user and set refresh token cookie', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const tokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: { id: '1', email: 'test@example.com' },
      };
      jest.spyOn(authService, 'register').mockResolvedValue(tokens);

      const result = await controller.register(registerDto, mockResponse as Response);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.any(Object),
      );
      expect(result).toEqual({
        accessToken: tokens.accessToken,
        user: tokens.user,
      });
    });
  });

  describe('login', () => {
    it('should log in a user and set refresh token cookie', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const tokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: { id: '1', email: 'test@example.com' },
      };
      jest.spyOn(authService, 'login').mockResolvedValue(tokens);

      const result = await controller.login(loginDto, mockResponse as Response);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.any(Object),
      );
      expect(result).toEqual({
        accessToken: tokens.accessToken,
        user: tokens.user,
      });
    });

    it('should return 429 after 10 login attempts within 60 seconds', async () => {
      // Use supertest to hit the full NestJS pipeline (guards included)
      const loginPayload = {
        email: 'test@example.com',
        password: 'password123',
      };
      const tokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: { id: '1', email: 'test@example.com' },
      };
      jest.spyOn(authService, 'login').mockResolvedValue(tokens);

      // Make 10 successful requests through the HTTP pipeline
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginPayload)
          .expect(200);
      }

      // The 11th request should be throttled (429)
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginPayload)
        .expect(429);

      expect(response.body.message).toBe('ThrottlerException: Too Many Requests');
      expect(response.headers).toHaveProperty('retry-after');
    });
  });

  describe('refresh', () => {
    it('should refresh tokens and set new refresh token cookie', async () => {
      const tokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        user: { id: '1', email: 'test@example.com' },
      };
      jest.spyOn(authService, 'refreshToken').mockResolvedValue(tokens);

      const req = { cookies: { refresh_token: 'old_refresh_token' } } as any;
      const result = await controller.refresh(req, mockResponse as Response);

      expect(authService.refreshToken).toHaveBeenCalledWith('old_refresh_token');
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.any(Object),
      );
      expect(result).toEqual({
        accessToken: tokens.accessToken,
        user: tokens.user,
      });
    });

    it('should throw UnauthorizedException if refresh token is missing', async () => {
      const req = { cookies: {} } as any;
      await expect(controller.refresh(req, mockResponse as Response)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh token cookie and revoke token', async () => {
      const req = { cookies: { refresh_token: 'some_refresh_token' } } as any;
      jest.spyOn(authService, 'revokeRefreshToken').mockResolvedValue(undefined);

      const result = await controller.logout(req, mockResponse as Response);

      expect(authService.revokeRefreshToken).toHaveBeenCalledWith('some_refresh_token');
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(Object),
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('should return success even if no refresh token cookie exists', async () => {
      const req = { cookies: {} } as any;

      const result = await controller.logout(req, mockResponse as Response);

      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('me', () => {
    it('should return the authenticated user', () => {
      const req = { user: { id: '1', email: 'test@example.com' } } as any;
      const result = controller.getProfile(req);
      expect(result).toEqual(req.user);
    });
  });
});
