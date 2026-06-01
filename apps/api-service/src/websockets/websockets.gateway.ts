import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/ws',
})
export class WebsocketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedClients: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;

      // Track connection
      if (!this.connectedClients.has(payload.sub)) {
        this.connectedClients.set(payload.sub, new Set());
      }
      this.connectedClients.get(payload.sub)!.add(client.id);

      client.join(`user:${payload.sub}`);
      client.emit('connected', { userId: payload.sub });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const sockets = this.connectedClients.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.connectedClients.delete(client.userId);
        }
      }
    }
  }

  @SubscribeMessage('subscribe-wallet')
  handleSubscribeWallet(client: AuthenticatedSocket, walletId: string) {
    if (!client.userId) return;
    client.join(`wallet:${walletId}`);
  }

  @SubscribeMessage('unsubscribe-wallet')
  handleUnsubscribeWallet(client: AuthenticatedSocket, walletId: string) {
    if (!client.userId) return;
    client.leave(`wallet:${walletId}`);
  }

  /**
   * Emit a wallet update event to all clients watching this wallet
   */
  emitWalletUpdate(walletId: string, data: any) {
    this.server.to(`wallet:${walletId}`).emit('wallet_update', {
      walletId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an alert triggered event to the user who owns the wallet
   */
  emitAlertTriggered(userId: string, data: any) {
    this.server.to(`user:${userId}`).emit('alert_triggered', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get count of connected clients
   */
  getConnectedClientsCount(): number {
    return this.server.engine.clientsCount;
  }
}
