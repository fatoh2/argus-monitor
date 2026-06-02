import { Test, TestingModule } from '@nestjs/testing';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

describe('WalletsController', () => {
  let controller: WalletsController;
  let walletsService: jest.Mocked<WalletsService>;

  const mockUser = { id: 'user-1', email: 'test@example.com' };

  beforeEach(async () => {
    walletsService = {
      create: jest.fn(),
      findAllByUser: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        {
          provide: WalletsService,
          useValue: walletsService,
        },
      ],
    }).compile();

    controller = module.get<WalletsController>(WalletsController);
  });

  describe('POST /wallets', () => {
    it('should create a wallet and return 201', async () => {
      const dto = { address: 'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1', chain: 'SOLANA' };
      const expected = {
        id: 'wallet-1',
        address: dto.address,
        chain: dto.chain,
        userId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      walletsService.create.mockResolvedValue(expected);

      const result = await controller.create({ user: mockUser }, dto);

      expect(result).toEqual(expected);
      expect(walletsService.create).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('GET /wallets', () => {
    it('should return an array of wallets', async () => {
      const expected = [
        {
          id: 'wallet-1',
          address: 'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
          chain: 'SOLANA',
          userId: mockUser.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      walletsService.findAllByUser.mockResolvedValue(expected);

      const result = await controller.findAll({ user: mockUser });

      expect(result).toEqual(expected);
      expect(walletsService.findAllByUser).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return an empty array when no wallets exist', async () => {
      walletsService.findAllByUser.mockResolvedValue([]);

      const result = await controller.findAll({ user: mockUser });

      expect(result).toEqual([]);
    });
  });
});
