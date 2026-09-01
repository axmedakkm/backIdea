import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { SWAGGER_PATH, setupSwagger } from './config/swagger.setup';
import { PrismaService } from './prisma/prisma.service';

export const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const corsOrigins = config.get<string[]>('app.corsOrigins', ['http://localhost:3000']);
  const isProduction = config.get<string>('app.nodeEnv') === 'production';

  // --- Security ---------------------------------------------------------
  app.use(
    helmet({
      // Swagger UI loads inline scripts/styles, so CSP is relaxed for its path only.
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    maxAge: 86400,
  });

  // Trust the first proxy hop so rate limiting sees real client IPs behind a load balancer.
  app.set('trust proxy', 1);

  // Serves images written by the local-disk upload fallback (used when
  // Cloudinary credentials are absent). Harmless when Cloudinary is active.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // --- Routing ----------------------------------------------------------
  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['health'],
  });

  // --- Validation -------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  // --- Cross-cutting concerns -------------------------------------------
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new AllExceptionsFilter(config));

  // --- Lifecycle --------------------------------------------------------
  app.enableShutdownHooks();
  app.get(PrismaService).enableShutdownHooks(app);

  // --- API documentation ------------------------------------------------
  setupSwagger(app);

  await app.listen(port);

  logger.log(`ESCA Estate API listening on http://localhost:${port}/${API_PREFIX}`);
  logger.log(`Swagger UI available at   http://localhost:${port}/${SWAGGER_PATH}`);
}

void bootstrap();
