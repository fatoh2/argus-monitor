import { Test, TestingModule } from '@nestjs/testing';
import { WalletsController } from '../wallets.controller';
import { WalletsService } from '../wallets.service';

describe('WalletsController', () => {
  let controller: WalletsController;
  let walletsService: WalletsService;

  const mockRequest = {
    user: { id: 'user-1', email: 'test@example.com' },
  };

  const mockWallet = {
    id: 'wallet-1',
    address: 'ABC123def456',
    chain: 'SOLANA',
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        {
          provide: WalletsService,
          useValue: {
            create: jest.fn(),
            findAllByUser: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WalletsController>(WalletsController);
    walletsService = module.get<WalletsService>(WalletsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a wallet', async () => {
      const dto = { address: 'ABC123def456', chain: 'SOLANA' };
      jest.spyOn(walletsService, 'create').mockResolvedValue(mockWallet);

      const result = await controller.create(mockRequest, dto);

      expect(walletsService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockWallet);
    });
  });

  describe('findAll', () => {
    it('should return all wallets for the user', async () => {
      jest.spyOn(walletsService, 'findAllByUser').mockResolvedValue([mockWallet]);

      const result = await controller.findAll(mockRequest);

      expect(walletsService.findAllByUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockWallet]);
    });
  });

  describe('findOne', () => {
    it('should return a single wallet', async () => {
      jest.spyOn(walletsService, 'findOne').mockResolvedValue(mockWallet);

      const result = await controller.findOne(mockRequest, 'wallet-1');

      expect(walletsService.findOne).toHaveBeenCalledWith('wallet-1', 'user-1');
      expect(result).toEqual(mockWallet);
    });
  });

  describe('remove', () => {
    it('should delete a wallet', async () => {
      jest.spyOn(walletsService, 'remove').mockResolvedValue({ message: 'Wallet deleted successfully' });

      const result = await controller.remove(mockRequest, 'wallet-1');

      expect(walletsService.remove).toHaveBeenCalledWith('wallet-1', 'user-1');
      expect(result).toEqual({ message: 'Wallet deleted successfully' });
    });
  });
});
