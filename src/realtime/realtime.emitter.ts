import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { rooms } from './realtime.constants';

/**
 * Holds the Socket.IO server so ordinary services can broadcast without
 * importing the gateway.
 *
 * The gateway depends on the feature services (to handle inbound events) and
 * the feature services depend on this emitter (to push outbound events). Going
 * through this indirection is what keeps that from becoming a circular import.
 *
 * Emitting before the gateway has initialised is a no-op rather than an error,
 * so HTTP requests still succeed if the WebSocket server is unavailable.
 */
@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private server?: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  get isReady(): boolean {
    return Boolean(this.server);
  }

  /** Sends to every socket the user has open, across devices. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emit(rooms.user(userId), event, payload);
  }

  /** Sends to everyone currently in a conversation room. */
  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.emit(rooms.conversation(conversationId), event, payload);
  }

  /** Sends to a conversation room, excluding the socket that triggered it. */
  emitToConversationExcept(
    conversationId: string,
    excludeSocketId: string,
    event: string,
    payload: unknown,
  ): void {
    if (!this.server) {
      return;
    }

    this.server.to(rooms.conversation(conversationId)).except(excludeSocketId).emit(event, payload);
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`Dropping "${event}" for ${room}: realtime server not started`);
      return;
    }

    this.server.to(room).emit(event, payload);
  }
}
