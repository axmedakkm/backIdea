import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { AuthenticatedUser, JwtPayload } from '../common/types/authenticated-user.type';
import { ConversationsService } from '../conversations/conversations.service';
import { CreateMessageDto } from '../conversations/dto/create-message.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CLIENT_EVENTS, SERVER_EVENTS, rooms } from './realtime.constants';
import { RealtimeEmitter } from './realtime.emitter';
import { ConversationIdDto, SocketMessageDto } from './dto/socket-events.dto';

/** Socket with the authenticated user attached during the handshake. */
type AuthedSocket = Socket & { user: AuthenticatedUser };

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:5000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  /** Tracks how many sockets each user has open, to emit online/offline once. */
  private readonly socketCountByUser = new Map<string, number>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  afterInit(server: Server): void {
    // Hands the server to the emitter so HTTP-side services can broadcast.
    this.realtime.setServer(server);
    this.logger.log('Realtime gateway initialised on namespace /realtime');
  }

  /**
   * Authenticates the handshake. Tokens may arrive via `auth.token`
   * (preferred) or the Authorization header. Unauthenticated sockets are
   * disconnected immediately — there are no anonymous realtime features.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authenticate(client);
      (client as AuthedSocket).user = user;

      // Personal room: notifications and cross-device fan-out.
      await client.join(rooms.user(user.id));

      const openSockets = (this.socketCountByUser.get(user.id) ?? 0) + 1;
      this.socketCountByUser.set(user.id, openSockets);

      // Announce presence only on the first socket for this user.
      if (openSockets === 1) {
        await this.broadcastPresence(user.id, SERVER_EVENTS.USER_ONLINE);
      }

      this.logger.debug(`Socket ${client.id} connected for user ${user.id}`);
    } catch (error) {
      this.logger.warn(`Rejected socket ${client.id}: ${(error as Error).message}`);
      client.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = (client as AuthedSocket).user;

    if (!user) {
      return;
    }

    const remaining = (this.socketCountByUser.get(user.id) ?? 1) - 1;

    if (remaining <= 0) {
      this.socketCountByUser.delete(user.id);
      await this.broadcastPresence(user.id, SERVER_EVENTS.USER_OFFLINE);
    } else {
      this.socketCountByUser.set(user.id, remaining);
    }

    this.logger.debug(`Socket ${client.id} disconnected for user ${user.id}`);
  }

  // -------------------------------------------------------------------------
  //  Conversation membership
  // -------------------------------------------------------------------------

  // Returned objects must not contain an `event` key: Nest would treat that as
  // a WsResponse and emit it instead of invoking the client's ack callback.
  @SubscribeMessage(CLIENT_EVENTS.JOIN_CONVERSATION)
  async onJoinConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<{ joined: true; conversationId: string }> {
    await this.assertParticipant(client, body.conversationId);

    await client.join(rooms.conversation(body.conversationId));
    client.emit(SERVER_EVENTS.JOINED_CONVERSATION, { conversationId: body.conversationId });

    return { joined: true, conversationId: body.conversationId };
  }

  @SubscribeMessage(CLIENT_EVENTS.LEAVE_CONVERSATION)
  async onLeaveConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<{ left: true; conversationId: string }> {
    await client.leave(rooms.conversation(body.conversationId));
    client.emit(SERVER_EVENTS.LEFT_CONVERSATION, { conversationId: body.conversationId });

    return { left: true, conversationId: body.conversationId };
  }

  // -------------------------------------------------------------------------
  //  Messaging
  // -------------------------------------------------------------------------

  @SubscribeMessage(CLIENT_EVENTS.SEND_MESSAGE)
  async onSendMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: SocketMessageDto,
  ): Promise<unknown> {
    const { conversationId, ...message } = body;

    try {
      // Delegates to the same service the REST endpoint uses, so both
      // transports share one authorization and persistence path.
      return await this.conversations.sendMessage(
        conversationId,
        message as CreateMessageDto,
        client.user,
        client.id,
      );
    } catch (error) {
      throw new WsException((error as Error).message);
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.TYPING)
  async onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<{ ok: true }> {
    await this.assertParticipant(client, body.conversationId);

    this.realtime.emitToConversationExcept(
      body.conversationId,
      client.id,
      SERVER_EVENTS.TYPING,
      { conversationId: body.conversationId, userId: client.user.id },
    );

    return { ok: true };
  }

  @SubscribeMessage(CLIENT_EVENTS.STOP_TYPING)
  async onStopTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<{ ok: true }> {
    await this.assertParticipant(client, body.conversationId);

    this.realtime.emitToConversationExcept(
      body.conversationId,
      client.id,
      SERVER_EVENTS.STOP_TYPING,
      { conversationId: body.conversationId, userId: client.user.id },
    );

    return { ok: true };
  }

  @SubscribeMessage(CLIENT_EVENTS.MESSAGE_READ)
  async onMessageRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<{ updated: number }> {
    await this.assertParticipant(client, body.conversationId);

    const result = await this.conversations.markRead(body.conversationId, client.user.id);

    return { updated: result.updated };
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private async authenticate(client: Socket): Promise<AuthenticatedUser> {
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('No access token supplied');
    }

    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
    });

    if (payload.type !== 'access') {
      throw new Error('An access token is required');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        agent: { select: { id: true } },
      },
    });

    if (!user) {
      throw new Error('Account no longer exists or is deactivated');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      isEmailVerified: user.isEmailVerified,
      agentId: user.agent?.id ?? null,
    };
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token;

    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth.replace(/^Bearer\s+/i, '');
    }

    const header = client.handshake.headers.authorization;

    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7);
    }

    return undefined;
  }

  /** Re-checks participation on every event; joining a room once is not enough. */
  private async assertParticipant(client: AuthedSocket, conversationId: string): Promise<void> {
    const allowed = await this.conversations.isParticipant(conversationId, client.user.id);

    if (!allowed) {
      throw new WsException('You are not a participant in this conversation');
    }
  }

  /** Tells the user's active conversation partners that they came online or went offline. */
  private async broadcastPresence(userId: string, event: string): Promise<void> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        userId: { not: userId },
        conversation: { participants: { some: { userId } }, deletedAt: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    const payload = { userId, at: new Date().toISOString() };

    for (const participant of participants) {
      this.realtime.emitToUser(participant.userId, event, payload);
    }
  }
}
