import { Test, TestingModule } from '@nestjs/testing';
import { AlertRulesController } from '../alert-rules.controller';
import { AlertRulesService } from '../alert-rules.service';

describe('AlertRulesController', () => {
  let controller: AlertRulesController;
  let alertRulesService: AlertRulesService;

  const mockRequest = {
    user: { id: 'user-1', email: 'test@example.com' },
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertRulesController],
      providers: [
        {
          provide: AlertRulesService,
          useValue: {
            create: jest.fn(),
            findAllByUser: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AlertRulesController>(AlertRulesController);
    alertRulesService = module.get<AlertRulesService>(AlertRulesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an alert rule', async () => {
      const dto = {
        walletId: 'wallet-1',
        chain: 'SOLANA',
        type: 'balance_low',
        threshold: '1000000000',
      };
      jest.spyOn(alertRulesService, 'create').mockResolvedValue(mockAlertRule);

      const result = await controller.create(mockRequest, dto);

      expect(alertRulesService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockAlertRule);
    });
  });

  describe('findAll', () => {
    it('should return all alert rules for the user', async () => {
      jest.spyOn(alertRulesService, 'findAllByUser').mockResolvedValue([mockAlertRule]);

      const result = await controller.findAll(mockRequest);

      expect(alertRulesService.findAllByUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockAlertRule]);
    });
  });

  describe('findOne', () => {
    it('should return a single alert rule', async () => {
      jest.spyOn(alertRulesService, 'findOne').mockResolvedValue(mockAlertRule);

      const result = await controller.findOne(mockRequest, 'rule-1');

      expect(alertRulesService.findOne).toHaveBeenCalledWith('rule-1', 'user-1');
      expect(result).toEqual(mockAlertRule);
    });
  });

  describe('remove', () => {
    it('should delete an alert rule', async () => {
      jest.spyOn(alertRulesService, 'remove').mockResolvedValue({ message: 'Alert rule deleted successfully' });

      const result = await controller.remove(mockRequest, 'rule-1');

      expect(alertRulesService.remove).toHaveBeenCalledWith('rule-1', 'user-1');
      expect(result).toEqual({ message: 'Alert rule deleted successfully' });
    });
  });
});
