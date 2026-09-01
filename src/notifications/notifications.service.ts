import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { SERVER_EVENTS } from '../realtime/realtime.constants';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { NotificationEntity, UnreadCountEntity } from './entities/notification.entity';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType | keyof typeof NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  /**
   * Persists a notification and pushes it over Socket.IO.
   *
   * Delivery failures are logged rather than thrown: a notification is a
   * side effect, and it must never fail the request that produced it.
   */
  async createAndPush(input: CreateNotificationInput): Promise<NotificationEntity | null> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type as NotificationType,
          title: input.title,
          body: input.body,
          ...(input.data !== undefined ? { data: input.data } : {}),
        },
      });

      this.realtime.emitToUser(input.userId, SERVER_EVENTS.NOTIFICATION, notification);

      return notification;
    } catch (error) {
      this.logger.error(
        `Failed to create notification for user ${input.userId}`,
        error as Error,
      );
      return null;
    }
  }

  /** Batch variant used when several people need the same notification. */
  async createManyAndPush(inputs: CreateNotificationInput[]): Promise<void> {
    await Promise.all(inputs.map((input) => this.createAndPush(input)));
  }

  async findAll(
    userId: string,
    query: QueryNotificationDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async unreadCount(userId: string): Promise<UnreadCountEntity> {
    const unread = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { unread };
  }

  async markAsRead(userId: string, id: string): Promise<NotificationEntity> {
    await this.assertOwned(userId, id);

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<{ message: string; updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return {
      message: `Marked ${result.count} notification(s) as read`,
      updated: result.count,
    };
  }

  async remove(userId: string, id: string): Promise<{ message: string }> {
    await this.assertOwned(userId, id);

    await this.prisma.notification.delete({ where: { id } });

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Scoping the lookup by userId means another user's notification is
   * reported as "not found" rather than "forbidden", which avoids
   * confirming that the ID exists.
   */
  private async assertOwned(userId: string, id: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" was not found`);
    }
  }
}
