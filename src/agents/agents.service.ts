import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAgentDto } from './dto/query-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentEntity } from './entities/agent.entity';

/** Counts only listings that are actually visible in the marketplace. */
export const VISIBLE_PROPERTY_FILTER = {
  deletedAt: null,
  isPublished: true,
  isApproved: true,
} satisfies Prisma.PropertyWhereInput;

const AGENT_INCLUDE = {
  user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
  location: true,
} satisfies Prisma.AgentInclude;

type AgentWithRelations = Prisma.AgentGetPayload<{ include: typeof AGENT_INCLUDE }>;

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAgentDto): Promise<PaginatedResult<AgentEntity>> {
    const insensitive = Prisma.QueryMode.insensitive;

    const where: Prisma.AgentWhereInput = {
      deletedAt: null,
      // Never surface agents whose user account was deleted or deactivated.
      user: { deletedAt: null, isActive: true },
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.city ? { location: { city: { equals: query.city, mode: insensitive } } } : {}),
      ...(query.isVerified !== undefined ? { isVerified: query.isVerified } : {}),
      ...(query.minRating !== undefined ? { rating: { gte: query.minRating } } : {}),
      ...(query.search
        ? {
            OR: [
              { user: { name: { contains: query.search, mode: insensitive } } },
              { company: { contains: query.search, mode: insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: AGENT_INCLUDE,
      }),
      this.prisma.agent.count({ where }),
    ]);

    return paginate(
      items.map((agent) => this.toEntity(agent)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<AgentEntity> {
    const agent = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null, user: { deletedAt: null } },
      include: AGENT_INCLUDE,
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID "${id}" was not found`);
    }

    return this.toEntity(agent);
  }

  /**
   * An agent may update only their own profile; admins may update any.
   */
  async update(id: string, dto: UpdateAgentDto, actor: AuthenticatedUser): Promise<AgentEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const agent = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID "${id}" was not found`);
    }

    if (actor.role !== UserRole.ADMIN && agent.userId !== actor.id) {
      throw new ForbiddenException('You can only update your own agent profile');
    }

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, deletedAt: null },
        select: { id: true },
      });

      if (!location) {
        throw new BadRequestException(`Location with ID "${dto.locationId}" was not found`);
      }
    }

    if (dto.licenseNo) {
      const taken = await this.prisma.agent.findFirst({
        where: { licenseNo: dto.licenseNo, id: { not: id } },
        select: { id: true },
      });

      if (taken) {
        throw new ConflictException('This licence number is already registered to another agent');
      }
    }

    const updated = await this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.licenseNo !== undefined ? { licenseNo: dto.licenseNo } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.officePhone !== undefined ? { officePhone: dto.officePhone } : {}),
        ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
      },
      include: AGENT_INCLUDE,
    });

    return this.toEntity(updated);
  }

  /** Throws unless the agent exists and is visible. */
  async assertExists(id: string): Promise<void> {
    const agent = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID "${id}" was not found`);
    }
  }

  /**
   * Recomputes the denormalised listing count.
   * Called whenever a property is created, deleted or changes visibility.
   */
  async syncPropertyCount(agentId: string): Promise<void> {
    const propertyCount = await this.prisma.property.count({
      where: { agentId, ...VISIBLE_PROPERTY_FILTER },
    });

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { propertyCount },
    });
  }

  /**
   * Recomputes the denormalised rating and review count from live review rows.
   * Called after any review is created, edited or removed.
   */
  async syncRating(agentId: string): Promise<{ rating: number; reviewCount: number }> {
    const aggregate = await this.prisma.review.aggregate({
      where: { agentId, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });

    // Store one decimal place; an agent with no reviews rates 0, not null.
    const rating = Math.round((aggregate._avg.rating ?? 0) * 10) / 10;
    const reviewCount = aggregate._count._all;

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { rating, reviewCount },
    });

    return { rating, reviewCount };
  }

  private toEntity(agent: AgentWithRelations): AgentEntity {
    const { user, ...rest } = agent;

    return {
      ...rest,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
    };
  }
}
