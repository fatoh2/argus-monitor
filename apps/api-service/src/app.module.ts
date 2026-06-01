import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WalletsModule } from './wallets/wallets.module';
import { AlertRulesModule } from './alert-rules/alert-rules.module';
import { ChainsModule } from './chains/chains.module';
import { WebsocketsModule } from './websockets/websockets.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    WalletsModule,
    AlertRulesModule,
    ChainsModule,
    WebsocketsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
  ],
})
export class AppModule {}
