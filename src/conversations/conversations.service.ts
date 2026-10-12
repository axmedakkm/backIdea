import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SERVER_EVENTS } from '../realtime/realtime.constants';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationEntity, MessageEntity } from './entities/conversation.entity';

const CONVERSATION_INCLUDE = {
  participants: {
    include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
  },
  property: {
    select: {
      id: true,
      title: true,
      slug: true,
      images: { where: { isPrimary: true }, select: { url: true }, take: 1 },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, avatar: true } },
} satisfies Prisma.MessageInclude;

type MessageWithSender = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  // -------------------------------------------------------------------------
  //  Conversations
  // -------------------------------------------------------------------------

  async create(dto: CreateConversationDto, actor: AuthenticatedUser): Promise<ConversationEntity> {
    if (dto.participantId === actor.id) {
      throw new BadRequestException('You cannot start a conversation with yourself');
    }

    const participant = await this.prisma.user.findFirst({
      where: { id: dto.participantId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    });

    if (!participant) {
      throw new NotFoundException(`User with ID "${dto.participantId}" was not found`);
    }

    let propertyTitle: string | null = null;

    if (dto.propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: dto.propertyId, deletedAt: null },
        select: { id: true, title: true },
      });

      if (!property) {
        throw new NotFoundException(`Property with ID "${dto.propertyId}" was not found`);
      }

      propertyTitle = property.title;
    }

    // Reuse an existing thread for the same pair and property rather than
    // fragmenting the history across duplicates.
    const existing = await this.findExistingBetween(actor.id, dto.participantId, dto.propertyId);

    if (existing) {
      if (dto.message) {
        await this.sendMessage(existing.id, { content: dto.message }, actor);
      }

      return this.findOne(existing.id, actor);
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        propertyId: dto.propertyId,
        title: propertyTitle,
        participants: {
          create: [{ userId: actor.id }, { userId: dto.participantId }],
        },
      },
      include: CONVERSATION_INCLUDE,
    });

    if (dto.message) {
      await this.sendMessage(conversation.id, { content: dto.message }, actor);
      return this.findOne(conversation.id, actor);
    }

    return this.toConversationEntity(conversation, null, 0);
  }

  async findAll(
    actor: AuthenticatedUser,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ConversationEntity>> {
    // Scoping by participation is the authorization boundary for the whole module.
    const where: Prisma.ConversationWhereInput = {
      deletedAt: null,
      participants: { some: { userId: actor.id } },
    };

    const [conversations, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: CONVERSATION_INCLUDE,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const items = await Promise.all(
      conversations.map(async (conversation) => {
        const [lastMessage, unreadCount] = await Promise.all([
          this.prisma.message.findFirst({
            where: { conversationId: conversation.id, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            include: MESSAGE_INCLUDE,
          }),
          this.prisma.message.count({
            where: {
              conversationId: conversation.id,
              deletedAt: null,
              senderId: { not: actor.id },
              isRead: false,
            },
          }),
        ]);

        return this.toConversationEntity(conversation, lastMessage, unreadCount);
      }),
    );

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<ConversationEntity> {
    const conversation = await this.loadParticipatingOrThrow(id, actor);

    const [lastMessage, unreadCount] = await Promise.all([
      this.prisma.message.findFirst({
        where: { conversationId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.count({
        where: { conversationId: id, deletedAt: null, senderId: { not: actor.id }, isRead: false },
      }),
    ]);

    return this.toConversationEntity(conversation, lastMessage, unreadCount);
  }

  // -------------------------------------------------------------------------
  //  Messages
  // -------------------------------------------------------------------------

  async findMessages(
    conversationId: string,
    actor: AuthenticatedUser,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<MessageEntity>> {
    await this.loadParticipatingOrThrow(conversationId, actor);

    const where: Prisma.MessageWhereInput = { conversationId, deletedAt: null };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.count({ where }),
    ]);

    // Opening the thread marks the other party's messages as read.
    await this.markRead(conversationId, actor.id);

    return paginate(items, total, query.page, query.limit);
  }

  /**
   * Persists a message, updates the thread timestamp, broadcasts it over
   * Socket.IO and notifies recipients who are not currently connected to it.
   *
   * Shared by the REST endpoint and the `sendMessage` socket event so both
   * paths enforce identical authorization.
   */
  async sendMessage(
    conversationId: string,
    dto: CreateMessageDto,
    actor: AuthenticatedUser,
    originSocketId?: string,
  ): Promise<MessageEntity> {
    const conversation = await this.loadParticipatingOrThrow(conversationId, actor);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: actor.id,
          content: dto.content,
          type: dto.type ?? MessageType.TEXT,
          mediaUrl: dto.mediaUrl,
        },
        include: MESSAGE_INCLUDE,
      });

      // Keeps conversation ordering correct without a subquery on every list.
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });

      return created;
    });

    this.broadcastMessage(conversationId, message, originSocketId);

    const recipients = conversation.participants
      .filter((participant) => participant.userId !== actor.id)
      .map((participant) => participant.userId);

    await this.notifications.createManyAndPush(
      recipients.map((userId) => ({
        userId,
        type: 'NEW_MESSAGE' as const,
        title: `New message from ${message.sender.name}`,
        body: this.previewOf(message),
        data: { conversationId, messageId: message.id },
      })),
    );

    return message;
  }

  /** Marks the other party's messages as read and echoes it to the room. */
  async markRead(
    conversationId: string,
    userId: string,
  ): Promise<{ message: string; updated: number }> {
    const result = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, isRead: false, deletedAt: null },
      data: { isRead: true, readAt: new Date() },
    });

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    if (result.count > 0) {
      this.realtime.emitToConversation(conversationId, SERVER_EVENTS.MESSAGE_READ, {
        conversationId,
        readerId: userId,
        readAt: new Date().toISOString(),
        count: result.count,
      });
    }

    return { message: `Marked ${result.count} message(s) as read`, updated: result.count };
  }

  // -------------------------------------------------------------------------
  //  Authorization
  // -------------------------------------------------------------------------

  /**
   * The single gate for the whole module: a conversation is only reachable by
   * its participants. Non-participants get 404, so thread IDs cannot be probed.
   *
   * Admins are deliberately NOT exempt here — private correspondence stays
   * private, and moderation works through reports instead.
   */
  async loadParticipatingOrThrow(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ConversationWithRelations> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        deletedAt: null,
        participants: { some: { userId: actor.id } },
      },
      include: CONVERSATION_INCLUDE,
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID "${id}" was not found`);
    }

    return conversation;
  }

  /** Lightweight participation check used by the WebSocket gateway. */
  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.conversationParticipant.count({
      where: { conversationId, userId, conversation: { deletedAt: null } },
    });

    return count > 0;
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private async findExistingBetween(
    userA: string,
    userB: string,
    propertyId?: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.conversation.findFirst({
      where: {
        deletedAt: null,
        propertyId: propertyId ?? null,
        AND: [
          { participants: { some: { userId: userA } } },
          { participants: { some: { userId: userB } } },
        ],
      },
      select: { id: true },
    });
  }

  private broadcastMessage(
    conversationId: string,
    message: MessageWithSender,
    originSocketId?: string,
  ): void {
    // When the message arrived over a socket, skip echoing it back to that
    // socket — the client already rendered it optimistically.
    if (originSocketId) {
      this.realtime.emitToConversationExcept(
        conversationId,
        originSocketId,
        SERVER_EVENTS.NEW_MESSAGE,
        message,
      );
      return;
    }

    this.realtime.emitToConversation(conversationId, SERVER_EVENTS.NEW_MESSAGE, message);
  }

  private previewOf(message: MessageWithSender): string {
    if (message.type === MessageType.IMAGE) {
      return 'Sent an image';
    }

    if (message.type === MessageType.VOICE) {
      return 'Sent a voice message';
    }

    return message.content.length > 120
      ? `${message.content.slice(0, 117)}...`
      : message.content;
  }

  private toConversationEntity(
    conversation: ConversationWithRelations,
    lastMessage: MessageWithSender | null,
    unreadCount: number,
  ): ConversationEntity {
    const { participants, property, ...rest } = conversation;

    return {
      ...rest,
      participants: participants.map((participant) => ({
        id: participant.id,
        userId: participant.userId,
        name: participant.user.name,
        avatar: participant.user.avatar,
        role: participant.user.role,
        lastReadAt: participant.lastReadAt,
      })),
      property: property
        ? {
            id: property.id,
            title: property.title,
            slug: property.slug,
            coverImage: property.images[0]?.url ?? null,
          }
        : null,
      lastMessage,
      unreadCount,
    };
  }
}
