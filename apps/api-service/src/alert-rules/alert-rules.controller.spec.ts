import { Test, TestingModule } from '@nestjs/testing';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';

describe('AlertRulesController', () => {
  let controller: AlertRulesController;
  let alertRulesService: jest.Mocked<AlertRulesService>;

  const mockUser = { id: 'user-1', email: 'test@example.com' };

  beforeEach(async () => {
    alertRulesService = {
      create: jest.fn(),
      findAllByUser: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertRulesController],
      providers: [
        {
          provide: AlertRulesService,
          useValue: alertRulesService,
        },
      ],
    }).compile();

    controller = module.get<AlertRulesController>(AlertRulesController);
  });

  describe('POST /alert-rules', () => {
    it('should create an alert rule and return correct shape', async () => {
      const dto = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
      };
      const expected = {
        id: 'rule-1',
        userId: mockUser.id,
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      alertRulesService.create.mockResolvedValue(expected);

      const result = await controller.create({ user: mockUser }, dto);

      expect(result).toEqual(expected);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('walletId');
      expect(result).toHaveProperty('chain');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('threshold');
      expect(alertRulesService.create).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('GET /alert-rules', () => {
    it('should return an array of alert rules', async () => {
      const expected = [
        {
          id: 'rule-1',
          userId: mockUser.id,
          walletId: 'wallet-1',
          chain: 'SOLANA',
          type: 'balance_low',
          threshold: '1000000000',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      alertRulesService.findAllByUser.mockResolvedValue(expected);

      const result = await controller.findAll({ user: mockUser });

      expect(result).toEqual(expected);
      expect(Array.isArray(result)).toBe(true);
      expect(alertRulesService.findAllByUser).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return an empty array when no rules exist', async () => {
      alertRulesService.findAllByUser.mockResolvedValue([]);

      const result = await controller.findAll({ user: mockUser });

      expect(result).toEqual([]);
    });
  });

  describe('GET /alert-rules/:id', () => {
    it('should return a single alert rule', async () => {
      const expected = {
        id: 'rule-1',
        userId: mockUser.id,
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      alertRulesService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne({ user: mockUser }, 'rule-1');

      expect(result).toEqual(expected);
      expect(alertRulesService.findOne).toHaveBeenCalledWith('rule-1', mockUser.id);
    });
  });

  describe('DELETE /alert-rules/:id', () => {
    it('should delete an alert rule', async () => {
      alertRulesService.remove.mockResolvedValue({ message: 'Alert rule deleted successfully' });

      const result = await controller.remove({ user: mockUser }, 'rule-1');

      expect(result).toEqual({ message: 'Alert rule deleted successfully' });
      expect(alertRulesService.remove).toHaveBeenCalledWith('rule-1', mockUser.id);
    });
  });
});
