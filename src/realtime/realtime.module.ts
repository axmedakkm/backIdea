import { Global, Module } from '@nestjs/common';
import { RealtimeEmitter } from './realtime.emitter';

/**
 * Provides the emitter globally so any service can broadcast.
 *
 * The gateway itself lives in ConversationsModule, where its dependencies
 * (ConversationsService) are already available — keeping the emitter separate
 * is what breaks the gateway/service dependency cycle.
 */
@Global()
@Module({
  providers: [RealtimeEmitter],
  exports: [RealtimeEmitter],
})
export class RealtimeModule {}
