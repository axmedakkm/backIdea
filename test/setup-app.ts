import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Marks this process as a test run before the app is built.
 *
 * `AppThrottlerGuard` skips rate limiting under NODE_ENV=test, which the e2e
 * suite needs because it registers and logs in far more often than a real
 * client. Setting it here works because dotenv does not override variables
 * that are already present in `process.env`.
 */
process.env.NODE_ENV = 'test';

export interface E2EContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the real application (same pipes, filters and interceptors as
 * `main.ts`) against the configured DATABASE_URL, with rate limiting off.
 */
export async function createTestApp(): Promise<E2EContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter(config));

  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** Unique email per test run so parallel or repeated runs never collide. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 100000)}@e2e.test`;
}

export const STRONG_PASSWORD = 'E2e!Passw0rd';
