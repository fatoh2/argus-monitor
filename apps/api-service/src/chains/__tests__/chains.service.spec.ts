import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ChainsService } from '../chains.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ChainsService', () => {
  let service: ChainsService;

  const mockChain = {
    id: 'chain-1',
    name: 'Solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    chain: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ChainsService>(ChainsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a chain', async () => {
      mockPrisma.chain.findUnique.mockResolvedValue(null);
      mockPrisma.chain.create.mockResolvedValue(mockChain);

      const result = await service.create({
        name: 'Solana',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
      });

      expect(mockPrisma.chain.findUnique).toHaveBeenCalledWith({ where: { name: 'Solana' } });
      expect(mockPrisma.chain.create).toHaveBeenCalledWith({
        data: { name: 'Solana', rpcUrl: 'https://api.mainnet-beta.solana.com' },
      });
      expect(result).toEqual(mockChain);
    });

    it('should throw ConflictException if chain already exists', async () => {
      mockPrisma.chain.findUnique.mockResolvedValue(mockChain);

      await expect(
        service.create({ name: 'Solana', rpcUrl: 'https://api.mainnet-beta.solana.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all chains', async () => {
      mockPrisma.chain.findMany.mockResolvedValue([mockChain]);

      const result = await service.findAll();

      expect(mockPrisma.chain.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
      expect(result).toEqual([mockChain]);
    });

    it('should return empty array if no chains', async () => {
      mockPrisma.chain.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a chain by id', async () => {
      mockPrisma.chain.findUnique.mockResolvedValue(mockChain);

      const result = await service.findOne('chain-1');

      expect(mockPrisma.chain.findUnique).toHaveBeenCalledWith({ where: { id: 'chain-1' } });
      expect(result).toEqual(mockChain);
    });

    it('should throw NotFoundException if chain not found', async () => {
      mockPrisma.chain.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a chain', async () => {
      mockPrisma.chain.findUnique.mockResolvedValue(mockChain);
      mockPrisma.chain.delete.mockResolvedValue(mockChain);

      const result = await service.remove('chain-1');

      expect(mockPrisma.chain.findUnique).toHaveBeenCalledWith({ where: { id: 'chain-1' } });
      expect(mockPrisma.chain.delete).toHaveBeenCalledWith({ where: { id: 'chain-1' } });
      expect(result).toEqual({ message: 'Chain deleted successfully' });
    });

    it('should throw NotFoundException if chain not found', async () => {
      mockPrisma.chain.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
