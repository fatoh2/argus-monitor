import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockResponse = () => {
    const res: any = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /auth/register', () => {
    it('should register a user and return JWT tokens', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const tokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        user: { id: 'user-1', email: 'test@example.com' },
      };

      authService.register.mockResolvedValue(tokens);
      const res = mockResponse();

      const result = await controller.register(dto, res);

      expect(result).toEqual({
        accessToken: 'access-token-123',
        user: { id: 'user-1', email: 'test@example.com' },
      });
      expect(res.cookie).toHaveBeenCalled();
      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /auth/login', () => {
    it('should login a user and return JWT tokens', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const tokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        user: { id: 'user-1', email: 'test@example.com' },
      };

      authService.login.mockResolvedValue(tokens);
      const res = mockResponse();

      const result = await controller.login(dto, res);

      expect(result).toEqual({
        accessToken: 'access-token-123',
        user: { id: 'user-1', email: 'test@example.com' },
      });
      expect(res.cookie).toHaveBeenCalled();
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });
});
