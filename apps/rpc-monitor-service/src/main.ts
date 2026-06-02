import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3005;
  await app.listen(port);
  logger.log(`RPC monitor service running on port ${port}`);
}
bootstrap();
