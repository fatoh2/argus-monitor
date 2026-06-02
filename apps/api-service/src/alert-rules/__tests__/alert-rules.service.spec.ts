import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AlertRulesService } from '../alert-rules.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AlertRulesService', () => {
  let service: AlertRulesService;

  const mockWallet = {
    id: 'wallet-1',
    address: 'ABC123def456',
    chain: 'SOLANA',
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAlertRule = {
    id: 'rule-1',
    userId: 'user-1',
    walletId: 'wallet-1',
    chain: 'SOLANA',
    type: 'balance_low',
    threshold: '1000000000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    wallet: {
      findFirst: jest.fn(),
    },
    alertRule: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertRulesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AlertRulesService>(AlertRulesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an alert rule', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(mockWallet);
      mockPrisma.alertRule.create.mockResolvedValue(mockAlertRule);

      const result = await service.create('user-1', {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
      });

      expect(mockPrisma.wallet.findFirst).toHaveBeenCalledWith({
        where: { id: 'wallet-1', userId: 'user-1' },
      });
      expect(mockPrisma.alertRule.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          walletId: 'wallet-1',
          chain: 'SOLANA',
          type: 'balance_low',
          threshold: '1000000000',
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockAlertRule);
    });

    it('should throw NotFoundException if wallet not found', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          walletId: 'nonexistent',
          chain: 'SOLANA',
          type: 'balance_low',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create an alert rule without threshold', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(mockWallet);
      mockPrisma.alertRule.create.mockResolvedValue({
        ...mockAlertRule,
        threshold: null,
      });

      const result = await service.create('user-1', {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'transaction_from',
      });

      expect(mockPrisma.alertRule.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          walletId: 'wallet-1',
          chain: 'SOLANA',
          type: 'transaction_from',
          threshold: null,
        },
        select: expect.any(Object),
      });
      expect(result.threshold).toBeNull();
    });
  });

  describe('findAllByUser', () => {
    it('should return all alert rules for a user', async () => {
      mockPrisma.alertRule.findMany.mockResolvedValue([mockAlertRule]);

      const result = await service.findAllByUser('user-1');

      expect(mockPrisma.alertRule.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockAlertRule]);
    });

    it('should return empty array if no rules', async () => {
      mockPrisma.alertRule.findMany.mockResolvedValue([]);

      const result = await service.findAllByUser('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return an alert rule by id', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(mockAlertRule);

      const result = await service.findOne('rule-1', 'user-1');

      expect(mockPrisma.alertRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'rule-1', userId: 'user-1' },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockAlertRule);
    });

    it('should throw NotFoundException if rule not found', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an alert rule', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(mockAlertRule);
      mockPrisma.alertRule.delete.mockResolvedValue(mockAlertRule);

      const result = await service.remove('rule-1', 'user-1');

      expect(mockPrisma.alertRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'rule-1', userId: 'user-1' },
      });
      expect(mockPrisma.alertRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
      expect(result).toEqual({ message: 'Alert rule deleted successfully' });
    });

    it('should throw NotFoundException if rule not found', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
