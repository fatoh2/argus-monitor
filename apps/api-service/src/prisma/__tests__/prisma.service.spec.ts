import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extend PrismaClient', () => {
    // PrismaClient has $connect and $disconnect methods
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
  });

  it('should have onModuleInit and onModuleDestroy lifecycle hooks', () => {
    expect(typeof service.onModuleInit).toBe('function');
    expect(typeof service.onModuleDestroy).toBe('function');
  });
});
