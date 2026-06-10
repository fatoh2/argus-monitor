import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { TelegramService } from './telegram/telegram.service';
import { NotificationConsumer } from './notification-consumer/notification.consumer';
import { QUEUES } from '@argus/shared-types';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    }),
    BullModule.registerQueue({
      name: QUEUES.NOTIFICATION_DISPATCH,
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, TelegramService, NotificationConsumer],
})
export class AppModule {}
