import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AlertEngineService } from './alert-engine/alert-engine.service';
import { AlertConsumer } from './alert-consumer/alert.consumer';
import { QUEUES } from '@argus/shared-types';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    BullModule.registerQueue({
      name: QUEUES.ALERT_EVALUATION,
    }),
    BullModule.registerQueue({
      name: QUEUES.NOTIFICATION_DISPATCH,
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, AlertEngineService, AlertConsumer],
})
export class AppModule {}
