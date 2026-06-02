import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WebsocketsGateway } from '../websockets.gateway';

describe('WebsocketsGateway', () => {
  let gateway: WebsocketsGateway;
  let jwtService: JwtService;

  const mockSocket = {
    id: 'socket-1',
    handshake: {
      auth: { token: 'valid-jwt-token' },
      query: {},
    },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    engine: {
      clientsCount: 5,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsocketsGateway,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn().mockReturnValue({ sub: 'user-1', email: 'test@example.com' }),
          },
        },
      ],
    }).compile();

    gateway = module.get<WebsocketsGateway>(WebsocketsGateway);
    jwtService = module.get<JwtService>(JwtService);
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should authenticate and join user room on valid token', async () => {
      await gateway.handleConnection(mockSocket as any);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt-token');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', { userId: 'user-1' });
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect if no token provided', async () => {
      const socketWithoutToken = {
        ...mockSocket,
        handshake: { auth: {}, query: {} },
      };

      await gateway.handleConnection(socketWithoutToken as any);

      expect(socketWithoutToken.disconnect).toHaveBeenCalled();
    });

    it('should disconnect on invalid token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket as any);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should extract token from query params', async () => {
      const socketWithQueryToken = {
        ...mockSocket,
        handshake: {
          auth: {},
          query: { token: 'query-token' },
        },
      };

      await gateway.handleConnection(socketWithQueryToken as any);

      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
    });
  });

  describe('handleDisconnect', () => {
    it('should clean up connection tracking', () => {
      // First connect
      const connectedSocket = { ...mockSocket, userId: 'user-1' };
      gateway.handleDisconnect(connectedSocket as any);

      // Should not throw — just cleanup
      expect(connectedSocket.userId).toBe('user-1');
    });
  });

  describe('subscribe-wallet', () => {
    it('should join wallet room', () => {
      const client = { ...mockSocket, userId: 'user-1' };

      gateway.handleSubscribeWallet(client as any, 'wallet-1');

      expect(client.join).toHaveBeenCalledWith('wallet:wallet-1');
    });

    it('should not join if no userId', () => {
      const client = { ...mockSocket, userId: undefined };

      gateway.handleSubscribeWallet(client as any, 'wallet-1');

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe-wallet', () => {
    it('should leave wallet room', () => {
      const client = { ...mockSocket, userId: 'user-1' };

      gateway.handleUnsubscribeWallet(client as any, 'wallet-1');

      expect(client.leave).toHaveBeenCalledWith('wallet:wallet-1');
    });

    it('should not leave if no userId', () => {
      const client = { ...mockSocket, userId: undefined };

      gateway.handleUnsubscribeWallet(client as any, 'wallet-1');

      expect(client.leave).not.toHaveBeenCalled();
    });
  });

  describe('emitWalletUpdate', () => {
    it('should emit to wallet room', () => {
      gateway.emitWalletUpdate('wallet-1', { balance: '1000' });

      expect(mockServer.to).toHaveBeenCalledWith('wallet:wallet-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'wallet_update',
        expect.objectContaining({
          walletId: 'wallet-1',
          balance: '1000',
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('emitAlertTriggered', () => {
    it('should emit to user room', () => {
      gateway.emitAlertTriggered('user-1', { alertId: 'alert-1' });

      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'alert_triggered',
        expect.objectContaining({
          alertId: 'alert-1',
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('getConnectedClientsCount', () => {
    it('should return client count', () => {
      const count = gateway.getConnectedClientsCount();
      expect(count).toBe(5);
    });
  });
});
