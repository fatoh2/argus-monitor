import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

function parseAllowedOrigins(): string[] | string {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === '') {
    // Fallback: allow all origins in development, block all in production
    return process.env.NODE_ENV === 'production' ? [] : '*';
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers — sets CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
  app.use(helmet());

  // Global exception filter — prevents stack traces leaking in production
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable CORS for frontend — locked down to allowed origins
  app.enableCors({
    origin: parseAllowedOrigins(),
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe — whitelist strips unknown props,
  // forbidNonWhitelisted throws on unknown props,
  // transform coerces types (e.g. string→number for query params)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`API service running on port ${port}`);
}
bootstrap();
