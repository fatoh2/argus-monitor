import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';

describe('AppController (solana-adapter-service)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('getHello', () => {
    it('should return hello world', () => {
      expect(controller.getHello()).toBe('Hello World!');
    });
  });

  describe('getHealth', () => {
    it('should return OK', () => {
      expect(controller.getHealth()).toBe('OK');
    });
  });
});
