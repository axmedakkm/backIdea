import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AgentsModule } from './agents/agents.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CategoriesModule } from './categories/categories.module';
import { ConversationsModule } from './conversations/conversations.module';
import { FavoritesModule } from './favorites/favorites.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { appConfig, cloudinaryConfig, jwtConfig, validateEnv } from './config';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { PrismaModule } from './prisma/prisma.module';
import { PropertiesModule } from './properties/properties.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      load: [appConfig, jwtConfig, cloudinaryConfig],
      validate: validateEnv,
    }),

    // Global rate limiting. Individual routes tighten this with @Throttle().
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('app.throttleTtl', 60) * 1000,
            limit: config.get<number>('app.throttleLimit', 120),
          },
        ],
      }),
    }),

    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    UploadsModule,
    RealtimeModule,
    CategoriesModule,
    LocationsModule,
    AgentsModule,
    PropertiesModule,
    NotificationsModule,
    FavoritesModule,
    AppointmentsModule,
    ConversationsModule,
    ReviewsModule,
    ReportsModule,
    AdminModule,
  ],
  providers: [
    // Guard order matters: throttle first, then authenticate, then authorise.
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
