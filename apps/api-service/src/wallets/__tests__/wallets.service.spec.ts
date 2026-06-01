import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WalletsService } from '../wallets.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('WalletsService', () => {
  let service: WalletsService;

  const mockWallet = {
    id: 'wallet-1',
    address: 'ABC123def456',
    chain: 'SOLANA',
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    wallet: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a wallet', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.create.mockResolvedValue(mockWallet);

      const result = await service.create('user-1', {
        address: 'ABC123def456',
        chain: 'SOLANA',
      });

      expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith({ where: { address: 'ABC123def456' } });
      expect(mockPrisma.wallet.create).toHaveBeenCalledWith({
        data: { address: 'ABC123def456', chain: 'SOLANA', userId: 'user-1' },
        select: { id: true, address: true, chain: true, userId: true, createdAt: true, updatedAt: true },
      });
      expect(result).toEqual(mockWallet);
    });

    it('should throw ConflictException if address already exists', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);

      await expect(
        service.create('user-1', { address: 'ABC123def456', chain: 'SOLANA' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllByUser', () => {
    it('should return all wallets for a user', async () => {
      mockPrisma.wallet.findMany.mockResolvedValue([mockWallet]);

      const result = await service.findAllByUser('user-1');

      expect(mockPrisma.wallet.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { id: true, address: true, chain: true, userId: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockWallet]);
    });

    it('should return empty array if no wallets', async () => {
      mockPrisma.wallet.findMany.mockResolvedValue([]);

      const result = await service.findAllByUser('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a wallet by id', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(mockWallet);

      const result = await service.findOne('wallet-1', 'user-1');

      expect(mockPrisma.wallet.findFirst).toHaveBeenCalledWith({
        where: { id: 'wallet-1', userId: 'user-1' },
        select: { id: true, address: true, chain: true, userId: true, createdAt: true, updatedAt: true },
      });
      expect(result).toEqual(mockWallet);
    });

    it('should throw NotFoundException if wallet not found', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a wallet', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(mockWallet);
      mockPrisma.wallet.delete.mockResolvedValue(mockWallet);

      const result = await service.remove('wallet-1', 'user-1');

      expect(mockPrisma.wallet.findFirst).toHaveBeenCalledWith({ where: { id: 'wallet-1', userId: 'user-1' } });
      expect(mockPrisma.wallet.delete).toHaveBeenCalledWith({ where: { id: 'wallet-1' } });
      expect(result).toEqual({ message: 'Wallet deleted successfully' });
    });

    it('should throw NotFoundException if wallet not found', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
