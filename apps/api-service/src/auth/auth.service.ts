import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/prisma-error.handler';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
        },
      });

      return this.generateTokens(user.id, user.email);
    } catch (error) {
      handlePrismaError(error, 'AuthService.register');
    }
  }

  async login(dto: LoginDto) {
    try {
      const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      return this.generateTokens(user.id, user.email);
    } catch (error) {
      handlePrismaError(error, 'AuthService.login');
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ sub: string; email: string; jti?: string }>(refreshToken);

      // Check if token has been revoked
      if (payload.jti) {
        const revoked = await this.prisma.revokedToken.findUnique({
          where: { tokenJti: payload.jti },
        });
        if (revoked) {
          throw new UnauthorizedException('Token has been revoked');
        }
      }

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return this.generateTokens(user.id, user.email);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Convert JWT verification errors to UnauthorizedException
      if (error instanceof Error && (error.message === 'jwt expired' || error.message === 'invalid token' || error.message === 'jwt malformed' || error.message === 'invalid signature')) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      handlePrismaError(error, 'AuthService.refreshToken');
    }
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<{ sub: string; email: string; jti?: string; exp?: number }>(refreshToken);
      if (payload.jti && payload.exp) {
        // Store the revoked token JTI so it can't be reused
        await this.prisma.revokedToken.upsert({
          where: { tokenJti: payload.jti },
          update: {}, // Already exists — no-op
          create: {
            tokenJti: payload.jti,
            expiresAt: new Date(payload.exp * 1000), // exp is in seconds
          },
        });
      }
    } catch (error) {
      // If token is already expired/invalid, nothing to revoke
      // Log at debug level so we can detect probing/malformed tokens without
      // alerting on routine expired-token cleanup
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Any JWT verification error means the token can't be revoked — silently ignore
      if (error instanceof Error) {
        this.logger.debug('Attempted to revoke an invalid or expired refresh token: ' + error.message);
        return;
      }
      handlePrismaError(error, 'AuthService.revokeRefreshToken');
    }
  }

  private generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_TTL,
    });

    // Generate refresh token with a unique JWT ID (jti) for revocation support
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: crypto.randomUUID() },
      {
        expiresIn: REFRESH_TOKEN_TTL,
      },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email,
      },
    };
  }
}
