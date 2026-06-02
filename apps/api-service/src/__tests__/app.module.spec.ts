import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('AppModule (api-service)', () => {
  it('should compile the module without errors', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        wallet: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
        alertRule: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
        },
        chain: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
        },
        revokedToken: {
          findUnique: jest.fn(),
          upsert: jest.fn(),
        },
      })
      .compile();

    expect(module).toBeDefined();
  });
});
