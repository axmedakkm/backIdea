import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  // AuthModule supplies JwtModule, which the gateway uses to verify handshakes.
  imports: [NotificationsModule, AuthModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, RealtimeGateway],
  exports: [ConversationsService],
})
export class ConversationsModule {}
