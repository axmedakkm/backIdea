import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  PaginationMeta,
} from '../common/dto/api-response.dto';

export const SWAGGER_PATH = 'api/docs';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ESCA Estate Marketplace API')
    .setDescription(
      [
        'REST API for the ESCA Estate real estate marketplace.',
        '',
        '### Authentication',
        'Most endpoints require a bearer access token. Obtain one via `POST /api/v1/auth/login`,',
        'then click **Authorize** above and paste the `accessToken` value.',
        '',
        '### Response format',
        'Every successful response uses the envelope `{ success, message, data }`.',
        'List endpoints additionally return a `meta` object with pagination details.',
        'Errors use `{ success: false, statusCode, message, error, details?, path, timestamp }`.',
        '',
        '### Roles',
        '`USER` — browse, favourite, book appointments, message agents, write reviews.',
        '`AGENT` — everything a USER can do, plus manage their own property listings.',
        '`ADMIN` — full access including moderation and the admin dashboard.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'Paste the access token returned by /auth/login (without the "Bearer " prefix)',
      },
      'access-token',
    )
    .addTag('Auth', 'Registration, login, token refresh and password recovery')
    .addTag('Users', 'Current-user profile management')
    .addTag('Agents', 'Agent directory and profiles')
    .addTag('Properties', 'Property listings, search, filtering and comparison')
    .addTag('Property Images', 'Image upload and management for a listing')
    .addTag('Categories', 'Property categories')
    .addTag('Locations', 'Countries, cities and districts')
    .addTag('Favorites', 'Saved properties for the current user')
    .addTag('Appointments', 'Property viewing appointments')
    .addTag('Conversations', 'Messaging threads between users and agents')
    .addTag('Notifications', 'In-app notifications')
    .addTag('Reviews', 'Agent reviews and ratings')
    .addTag('Reports', 'Abuse reports')
    .addTag('Admin', 'Administrative dashboard and moderation (ADMIN only)')
    .addTag('Health', 'Service health probe')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiSuccessResponse, ApiErrorResponse, PaginationMeta],
  });

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
    },
    customSiteTitle: 'ESCA Estate API Documentation',
  });
}
