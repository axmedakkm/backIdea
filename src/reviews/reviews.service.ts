import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AgentsService } from '../agents/agents.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewDto } from './dto/query-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { AgentRatingSummary, ReviewEntity } from './entities/review.entity';

const REVIEW_INCLUDE = {
  author: { select: { id: true, name: true, avatar: true } },
} satisfies Prisma.ReviewInclude;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateReviewDto, actor: AuthenticatedUser): Promise<ReviewEntity> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.agentId, deletedAt: null },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID "${dto.agentId}" was not found`);
    }

    if (agent.userId === actor.id) {
      throw new BadRequestException('You cannot review your own agent profile');
    }

    // The unique (agentId, authorId) constraint backs this check at the database level.
    const existing = await this.prisma.review.findFirst({
      where: { agentId: dto.agentId, authorId: actor.id },
      select: { id: true, deletedAt: true },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        'You have already reviewed this agent. Update your existing review instead.',
      );
    }

    // Restore and overwrite a previously deleted review rather than colliding
    // with the unique constraint on (agentId, authorId).
    const review = existing
      ? await this.prisma.review.update({
          where: { id: existing.id },
          data: { rating: dto.rating, comment: dto.comment, deletedAt: null },
          include: REVIEW_INCLUDE,
        })
      : await this.prisma.review.create({
          data: {
            agentId: dto.agentId,
            authorId: actor.id,
            rating: dto.rating,
            comment: dto.comment,
          },
          include: REVIEW_INCLUDE,
        });

    await this.agents.syncRating(dto.agentId);

    await this.notifications.createAndPush({
      userId: agent.userId,
      type: 'NEW_REVIEW',
      title: 'You received a new review',
      body: `${review.author.name} left you a ${review.rating}-star review.`,
      data: { reviewId: review.id, agentId: agent.id },
    });

    return review;
  }

  async findByAgent(
    agentId: string,
    query: QueryReviewDto,
  ): Promise<PaginatedResult<ReviewEntity>> {
    await this.agents.assertExists(agentId);

    const where: Prisma.ReviewWhereInput = {
      agentId,
      deletedAt: null,
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: REVIEW_INCLUDE,
      }),
      this.prisma.review.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /** Average, count and per-star breakdown for an agent. */
  async ratingSummary(agentId: string): Promise<AgentRatingSummary> {
    await this.agents.assertExists(agentId);

    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { agentId, deletedAt: null },
      _count: { _all: true },
    });

    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    let weighted = 0;

    for (const bucket of grouped) {
      distribution[String(bucket.rating)] = bucket._count._all;
      total += bucket._count._all;
      weighted += bucket.rating * bucket._count._all;
    }

    return {
      rating: total > 0 ? Math.round((weighted / total) * 10) / 10 : 0,
      reviewCount: total,
      distribution,
    };
  }

  async findOne(id: string): Promise<ReviewEntity> {
    const review = await this.prisma.review.findFirst({
      where: { id, deletedAt: null },
      include: REVIEW_INCLUDE,
    });

    if (!review) {
      throw new NotFoundException(`Review with ID "${id}" was not found`);
    }

    return review;
  }

  async update(id: string, dto: UpdateReviewDto, actor: AuthenticatedUser): Promise<ReviewEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const review = await this.loadOwnedOrThrow(id, actor);

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
      },
      include: REVIEW_INCLUDE,
    });

    if (dto.rating !== undefined) {
      await this.agents.syncRating(review.agentId);
    }

    return updated;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<{ message: string }> {
    const review = await this.loadOwnedOrThrow(id, actor);

    await this.prisma.review.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.agents.syncRating(review.agentId);

    return { message: 'Review deleted successfully' };
  }

  /** Authors may edit their own review; admins may moderate any. */
  private async loadOwnedOrThrow(id: string, actor: AuthenticatedUser) {
    const review = await this.prisma.review.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, agentId: true, authorId: true },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID "${id}" was not found`);
    }

    if (actor.role !== UserRole.ADMIN && review.authorId !== actor.id) {
      throw new ForbiddenException('You can only modify your own reviews');
    }

    return review;
  }
}
