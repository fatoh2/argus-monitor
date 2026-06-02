import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUES } from '@argus/shared-types';

describe('AppModule (alert-service)', () => {
  it('should compile the module without errors', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getQueueToken(QUEUES.ALERT_EVALUATION))
      .useValue({ add: jest.fn(), process: jest.fn() })
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATION_DISPATCH))
      .useValue({ add: jest.fn(), process: jest.fn() })
      .compile();

    expect(module).toBeDefined();
  });
});
