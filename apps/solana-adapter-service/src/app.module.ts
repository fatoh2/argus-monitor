import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { SolanaAdapter } from './adapter/solana.adapter';
import { RateLimiterService } from './rate-limiter/rate-limiter.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { SolanaConsumer } from './consumer/solana.consumer';
import { RpcMonitorService } from './rpc-monitor/rpc-monitor.service';
import { RpcMonitorController } from './rpc-monitor/rpc-monitor.controller';
import configuration from './config/configuration';
import { QUEUES } from '@argus/shared-types';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: QUEUES.SOLANA_FETCH,
    }),
    HealthModule,
  ],
  controllers: [AppController, RpcMonitorController],
  providers: [
    AppService,
    SolanaAdapter,
    {
      provide: RateLimiterService,
      useFactory: (configService: ConfigService) => {
        const options = configService.get('rateLimiter');
        return new RateLimiterService(options);
      },
      inject: [ConfigService],
    },
    {
      provide: CircuitBreakerService,
      useFactory: (configService: ConfigService) => {
        const options = configService.get('circuitBreaker');
        return new CircuitBreakerService(options);
      },
      inject: [ConfigService],
    },
    SolanaConsumer,
    RpcMonitorService,
  ],
})
export class AppModule { }
