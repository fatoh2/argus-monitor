import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

/**
 * Integration tests for the API service REST endpoints.
 *
 * These tests use a real PostgreSQL database (via Testcontainers or CI service).
 * When running locally, ensure DATABASE_URL points to a test database.
 */

describe('API Service (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global pipes same as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    // Clean test database
    await prisma.revokedToken.deleteMany();
    await prisma.alertRule.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    await prisma.chain.deleteMany();
  });

  afterAll(async () => {
    // Clean up
    await prisma.revokedToken.deleteMany();
    await prisma.alertRule.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    await prisma.chain.deleteMany();
    await app.close();
  });

  describe('Health', () => {
    it('GET /health should return status up', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'up' });
    });
  });

  describe('Auth', () => {
    const testUser = {
      email: 'test-e2e@example.com',
      password: 'password123',
    };

    it('POST /auth/register should create a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(testUser.email);
      // Should set refresh token cookie
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('POST /auth/register should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(409);
    });

    it('POST /auth/register should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('POST /auth/login should authenticate valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(testUser)
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe(testUser.email);
      authToken = res.body.accessToken;
    });

    it('POST /auth/login should reject invalid password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('POST /auth/login should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' })
        .expect(401);
    });

    it('POST /auth/me should return user profile with valid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(testUser.email);
    });

    it('POST /auth/me should reject request without token', async () => {
      await request(app.getHttpServer())
        .post('/auth/me')
        .expect(401);
    });

    it('POST /auth/me should reject invalid token', async () => {
      await request(app.getHttpServer())
        .post('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Wallets', () => {
    let walletId: string;

    it('POST /wallets should create a wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'E2eWalletAddress123456789',
          chain: 'SOLANA',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.address).toBe('E2eWalletAddress123456789');
      expect(res.body.chain).toBe('SOLANA');
      walletId = res.body.id;
    });

    it('POST /wallets should reject duplicate address', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'E2eWalletAddress123456789',
          chain: 'SOLANA',
        })
        .expect(409);
    });

    it('POST /wallets should reject invalid chain', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'AnotherWallet',
          chain: 'BITCOIN',
        })
        .expect(400);
    });

    it('POST /wallets should reject request without auth', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .send({
          address: 'UnauthorizedWallet',
          chain: 'SOLANA',
        })
        .expect(401);
    });

    it('GET /wallets should return user wallets', async () => {
      const res = await request(app.getHttpServer())
        .get('/wallets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].address).toBe('E2eWalletAddress123456789');
    });

    it('GET /wallets/:id should return a single wallet', async () => {
      const res = await request(app.getHttpServer())
        .get(`/wallets/${walletId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(walletId);
    });

    it('GET /wallets/:id should return 404 for non-existent wallet', async () => {
      await request(app.getHttpServer())
        .get('/wallets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('DELETE /wallets/:id should delete a wallet', async () => {
      await request(app.getHttpServer())
        .delete(`/wallets/${walletId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('Alert Rules', () => {
    let walletId: string;
    let ruleId: string;

    beforeAll(async () => {
      // Create a wallet for alert rule tests
      const res = await request(app.getHttpServer())
        .post('/wallets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: 'AlertRuleWallet12345',
          chain: 'SOLANA',
        })
        .expect(201);
      walletId = res.body.id;
    });

    it('POST /alert-rules should create an alert rule', async () => {
      const res = await request(app.getHttpServer())
        .post('/alert-rules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletId,
          chain: 'SOLANA',
          type: 'balance_low',
          threshold: '1000000000',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('balance_low');
      expect(res.body.threshold).toBe('1000000000');
      ruleId = res.body.id;
    });

    it('POST /alert-rules should reject non-existent wallet', async () => {
      await request(app.getHttpServer())
        .post('/alert-rules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletId: '00000000-0000-0000-0000-000000000000',
          chain: 'SOLANA',
          type: 'balance_low',
        })
        .expect(404);
    });

    it('POST /alert-rules should reject invalid type', async () => {
      await request(app.getHttpServer())
        .post('/alert-rules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletId,
          chain: 'SOLANA',
          type: 'invalid_type',
        })
        .expect(400);
    });

    it('GET /alert-rules should return user alert rules', async () => {
      const res = await request(app.getHttpServer())
        .get('/alert-rules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /alert-rules/:id should return a single rule', async () => {
      const res = await request(app.getHttpServer())
        .get(`/alert-rules/${ruleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(ruleId);
    });

    it('DELETE /alert-rules/:id should delete a rule', async () => {
      await request(app.getHttpServer())
        .delete(`/alert-rules/${ruleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('Chains', () => {
    it('POST /chains should create a chain', async () => {
      const res = await request(app.getHttpServer())
        .post('/chains')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E Test Chain',
          rpcUrl: 'https://test-rpc.example.com',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Test Chain');
    });

    it('POST /chains should reject duplicate name', async () => {
      await request(app.getHttpServer())
        .post('/chains')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E Test Chain',
          rpcUrl: 'https://test-rpc.example.com',
        })
        .expect(409);
    });

    it('GET /chains should return all chains', async () => {
      const res = await request(app.getHttpServer())
        .get('/chains')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
