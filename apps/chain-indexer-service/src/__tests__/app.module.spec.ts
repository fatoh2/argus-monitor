import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';

describe('AppModule (chain-indexer-service)', () => {
  it('should compile the module without errors', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module).toBeDefined();
  });
});
