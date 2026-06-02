import { Test, TestingModule } from '@nestjs/testing';
import { ChainsController } from '../chains.controller';
import { ChainsService } from '../chains.service';

describe('ChainsController', () => {
  let controller: ChainsController;
  let chainsService: ChainsService;

  const mockChain = {
    id: 'chain-1',
    name: 'Solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChainsController],
      providers: [
        {
          provide: ChainsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChainsController>(ChainsController);
    chainsService = module.get<ChainsService>(ChainsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a chain', async () => {
      const dto = { name: 'Solana', rpcUrl: 'https://api.mainnet-beta.solana.com' };
      jest.spyOn(chainsService, 'create').mockResolvedValue(mockChain);

      const result = await controller.create(dto);

      expect(chainsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockChain);
    });
  });

  describe('findAll', () => {
    it('should return all chains', async () => {
      jest.spyOn(chainsService, 'findAll').mockResolvedValue([mockChain]);

      const result = await controller.findAll();

      expect(chainsService.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockChain]);
    });
  });

  describe('findOne', () => {
    it('should return a single chain', async () => {
      jest.spyOn(chainsService, 'findOne').mockResolvedValue(mockChain);

      const result = await controller.findOne('chain-1');

      expect(chainsService.findOne).toHaveBeenCalledWith('chain-1');
      expect(result).toEqual(mockChain);
    });
  });

  describe('remove', () => {
    it('should delete a chain', async () => {
      jest.spyOn(chainsService, 'remove').mockResolvedValue({ message: 'Chain deleted successfully' });

      const result = await controller.remove('chain-1');

      expect(chainsService.remove).toHaveBeenCalledWith('chain-1');
      expect(result).toEqual({ message: 'Chain deleted successfully' });
    });
  });
});
