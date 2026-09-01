import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportStatus, ReportTargetType } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportEntity } from './entities/report.entity';

const REPORT_INCLUDE = {
  reporter: { select: { id: true, name: true, email: true } },
  resolvedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ReportInclude;

type ReportWithRelations = Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

/** Statuses that count as "already actioned". */
const CLOSED_STATUSES: ReportStatus[] = [ReportStatus.RESOLVED, ReportStatus.REJECTED];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReportDto, actor: AuthenticatedUser): Promise<ReportEntity> {
    await this.assertTargetExists(dto.targetType, dto.targetId, actor);

    const duplicate = await this.prisma.report.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId: actor.id,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('You have already reported this item');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId: actor.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
      },
      include: REPORT_INCLUDE,
    });

    // Resolve the label here too, so the create response matches what
    // the list and detail endpoints return.
    const label = await this.resolveTargetLabel(report.targetType, report.targetId);

    return this.toEntity(report, label);
  }

  /** Reports the signed-in user has filed. */
  async findMine(
    actor: AuthenticatedUser,
    query: QueryReportDto,
  ): Promise<PaginatedResult<ReportEntity>> {
    // The reporter is passed separately rather than spread into the DTO:
    // spreading a class instance would drop the `skip` getter and silently
    // disable pagination.
    return this.list(query, actor.id);
  }

  /** Admin view across all reports. */
  async findAll(query: QueryReportDto): Promise<PaginatedResult<ReportEntity>> {
    return this.list(query);
  }

  async findOne(id: string): Promise<ReportEntity> {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });

    if (!report) {
      throw new NotFoundException(`Report with ID "${id}" was not found`);
    }

    const label = await this.resolveTargetLabel(report.targetType, report.targetId);
    return this.toEntity(report, label);
  }

  async update(id: string, dto: UpdateReportDto, admin: AuthenticatedUser): Promise<ReportEntity> {
    const existing = await this.prisma.report.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException(`Report with ID "${id}" was not found`);
    }

    if (existing.status === dto.status) {
      throw new BadRequestException(`This report is already ${dto.status}`);
    }

    const isClosing = CLOSED_STATUSES.includes(dto.status);

    const report = await this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote ?? null,
        // Record who closed it, and clear that if it is reopened for review.
        resolvedById: isClosing ? admin.id : null,
        resolvedAt: isClosing ? new Date() : null,
      },
      include: REPORT_INCLUDE,
    });

    const label = await this.resolveTargetLabel(report.targetType, report.targetId);
    return this.toEntity(report, label);
  }

  /** Counts by status, used by the admin dashboard. */
  async statusCounts(): Promise<Record<ReportStatus, number>> {
    const grouped = await this.prisma.report.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const counts: Record<ReportStatus, number> = {
      [ReportStatus.PENDING]: 0,
      [ReportStatus.REVIEWING]: 0,
      [ReportStatus.RESOLVED]: 0,
      [ReportStatus.REJECTED]: 0,
    };

    for (const bucket of grouped) {
      counts[bucket.status] = bucket._count._all;
    }

    return counts;
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private async list(
    query: QueryReportDto,
    forceReporterId?: string,
  ): Promise<PaginatedResult<ReportEntity>> {
    const reporterId = forceReporterId ?? query.reporterId;

    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(reporterId ? { reporterId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: REPORT_INCLUDE,
      }),
      this.prisma.report.count({ where }),
    ]);

    const withLabels = await Promise.all(
      items.map(async (report) => {
        const label = await this.resolveTargetLabel(report.targetType, report.targetId);
        return this.toEntity(report, label);
      }),
    );

    return paginate(withLabels, total, query.page, query.limit);
  }

  /**
   * Confirms the reported entity exists before accepting the report,
   * so the moderation queue never fills with references to nothing.
   */
  private async assertTargetExists(
    targetType: ReportTargetType,
    targetId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    switch (targetType) {
      case ReportTargetType.PROPERTY: {
        const property = await this.prisma.property.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        });

        if (!property) {
          throw new NotFoundException(`Property with ID "${targetId}" was not found`);
        }
        return;
      }

      case ReportTargetType.AGENT: {
        const agent = await this.prisma.agent.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true, userId: true },
        });

        if (!agent) {
          throw new NotFoundException(`Agent with ID "${targetId}" was not found`);
        }

        if (agent.userId === actor.id) {
          throw new BadRequestException('You cannot report your own agent profile');
        }
        return;
      }

      case ReportTargetType.USER: {
        if (targetId === actor.id) {
          throw new BadRequestException('You cannot report yourself');
        }

        const user = await this.prisma.user.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        });

        if (!user) {
          throw new NotFoundException(`User with ID "${targetId}" was not found`);
        }
        return;
      }

      case ReportTargetType.REVIEW: {
        const review = await this.prisma.review.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true, authorId: true },
        });

        if (!review) {
          throw new NotFoundException(`Review with ID "${targetId}" was not found`);
        }

        if (review.authorId === actor.id) {
          throw new BadRequestException('You cannot report your own review');
        }
        return;
      }
    }
  }

  /** Human-readable label for the reported entity, for the moderation queue. */
  private async resolveTargetLabel(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<{ label: string; exists: boolean }> {
    switch (targetType) {
      case ReportTargetType.PROPERTY: {
        const property = await this.prisma.property.findUnique({
          where: { id: targetId },
          select: { title: true },
        });
        return { label: property?.title ?? 'Deleted property', exists: Boolean(property) };
      }

      case ReportTargetType.AGENT: {
        const agent = await this.prisma.agent.findUnique({
          where: { id: targetId },
          select: { user: { select: { name: true } } },
        });
        return { label: agent?.user.name ?? 'Deleted agent', exists: Boolean(agent) };
      }

      case ReportTargetType.USER: {
        const user = await this.prisma.user.findUnique({
          where: { id: targetId },
          select: { name: true },
        });
        return { label: user?.name ?? 'Deleted user', exists: Boolean(user) };
      }

      case ReportTargetType.REVIEW: {
        const review = await this.prisma.review.findUnique({
          where: { id: targetId },
          select: { comment: true, rating: true },
        });

        if (!review) {
          return { label: 'Deleted review', exists: false };
        }

        const preview = review.comment?.slice(0, 60) ?? '(no comment)';
        return { label: `${review.rating}-star review: ${preview}`, exists: true };
      }
    }
  }

  private toEntity(
    report: ReportWithRelations,
    target: { label: string; exists: boolean } | null,
  ): ReportEntity {
    return { ...report, target };
  }
}
