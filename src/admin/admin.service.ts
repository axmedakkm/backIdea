import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { AgentsService } from '../agents/agents.service';
import { UserProfileEntity } from '../auth/entities/auth-response.entity';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyEntity } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import { ReportsService } from '../reports/reports.service';
import { AdminQueryUsersDto } from './dto/admin-query.dto';
import { AdminDashboardEntity } from './entities/dashboard.entity';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const ADMIN_PROPERTY_INCLUDE = {
  agent: { include: { user: { select: { name: true, email: true, phone: true, avatar: true } } } },
  category: true,
  location: true,
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  features: { orderBy: { name: 'asc' } },
  _count: { select: { favorites: true } },
} satisfies Prisma.PropertyInclude;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly agents: AgentsService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  //  Dashboard
  // -------------------------------------------------------------------------

  async dashboard(): Promise<AdminDashboardEntity> {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const live = { deletedAt: null } satisfies Prisma.PropertyWhereInput;

    const [
      totalUsers,
      userRoleGroups,
      newUsers,
      suspendedUsers,
      totalProperties,
      propertyStatusGroups,
      featuredProperties,
      newProperties,
      favorites,
      appointments,
      pendingAppointments,
      reviews,
      conversations,
      messages,
      reportCounts,
      topAgents,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: false } }),
      this.prisma.property.count({ where: live }),
      this.prisma.property.groupBy({
        by: ['status'],
        where: live,
        _count: { _all: true },
      }),
      this.prisma.property.count({ where: { ...live, isFeatured: true } }),
      this.prisma.property.count({ where: { ...live, createdAt: { gte: since } } }),
      this.prisma.favorite.count(),
      this.prisma.appointment.count({ where: { deletedAt: null } }),
      this.prisma.appointment.count({
        where: { deletedAt: null, status: AppointmentStatus.PENDING },
      }),
      this.prisma.review.count({ where: { deletedAt: null } }),
      this.prisma.conversation.count({ where: { deletedAt: null } }),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.reports.statusCounts(),
      this.prisma.agent.findMany({
        where: { deletedAt: null, reviewCount: { gt: 0 } },
        orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
        take: 5,
        select: {
          id: true,
          rating: true,
          reviewCount: true,
          propertyCount: true,
          user: { select: { name: true } },
        },
      }),
    ]);

    const byRole = (role: UserRole): number =>
      userRoleGroups.find((group) => group.role === role)?._count._all ?? 0;

    const byStatus = (status: PropertyStatus): number =>
      propertyStatusGroups.find((group) => group.status === status)?._count._all ?? 0;

    return {
      users: {
        total: totalUsers,
        users: byRole(UserRole.USER),
        agents: byRole(UserRole.AGENT),
        admins: byRole(UserRole.ADMIN),
        newLast30Days: newUsers,
        suspended: suspendedUsers,
      },
      properties: {
        total: totalProperties,
        approved: byStatus(PropertyStatus.APPROVED),
        pending: byStatus(PropertyStatus.PENDING),
        rejected: byStatus(PropertyStatus.REJECTED),
        draft: byStatus(PropertyStatus.DRAFT),
        sold: byStatus(PropertyStatus.SOLD),
        rented: byStatus(PropertyStatus.RENTED),
        featured: featuredProperties,
        newLast30Days: newProperties,
      },
      engagement: {
        favorites,
        appointments,
        pendingAppointments,
        reviews,
        conversations,
        messages,
      },
      reports: reportCounts,
      topAgents: topAgents.map((agent) => ({
        id: agent.id,
        name: agent.user.name,
        rating: agent.rating,
        reviewCount: agent.reviewCount,
        propertyCount: agent.propertyCount,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  //  Users
  // -------------------------------------------------------------------------

  async findUsers(query: AdminQueryUsersDto): Promise<PaginatedResult<UserProfileEntity>> {
    const where: Prisma.UserWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isEmailVerified !== undefined ? { isEmailVerified: query.isEmailVerified } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        // Explicit select keeps password and token columns out of the response.
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar: true,
          role: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          agent: { select: { id: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const shaped = items.map(({ agent, ...user }) => ({ ...user, agentId: agent?.id ?? null }));

    return paginate(shaped, total, query.page, query.limit);
  }

  async setUserActive(
    id: string,
    isActive: boolean,
    admin: AuthenticatedUser,
  ): Promise<UserProfileEntity> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" was not found`);
    }

    if (user.id === admin.id) {
      throw new BadRequestException('You cannot change the status of your own account');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Administrator accounts cannot be suspended through this API');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive,
        // Suspension ends every active session immediately.
        ...(isActive ? {} : { hashedRefreshToken: null }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        agent: { select: { id: true } },
      },
    });

    this.logger.log(
      `Admin ${admin.id} ${isActive ? 'reactivated' : 'suspended'} user ${id}`,
    );

    const { agent, ...rest } = updated;
    return { ...rest, agentId: agent?.id ?? null };
  }

  /**
   * Soft-deletes a user account. Mirrors UsersService#deleteMe (row is kept
   * for referential integrity, email is tombstoned for reuse) but is gated
   * by the same self/admin-account protections as setUserActive.
   */
  async deleteUser(id: string, admin: AuthenticatedUser): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" was not found`);
    }

    if (user.id === admin.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Administrator accounts cannot be deleted through this API');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        hashedRefreshToken: null,
        email: `deleted+${Date.now()}.${id}@deleted.local`,
        passwordResetToken: null,
        emailVerificationToken: null,
      },
    });

    this.logger.log(`Admin ${admin.id} deleted user ${id}`);

    return { message: 'User account deleted' };
  }

  // -------------------------------------------------------------------------
  //  Property moderation
  // -------------------------------------------------------------------------

  async approveProperty(id: string, admin: AuthenticatedUser): Promise<PropertyEntity> {
    const property = await this.loadPropertyOrThrow(id);

    if (property.status === PropertyStatus.APPROVED) {
      throw new BadRequestException('This property is already approved');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        status: PropertyStatus.APPROVED,
        isApproved: true,
        isPublished: true,
        rejectionReason: null,
      },
      include: ADMIN_PROPERTY_INCLUDE,
    });

    await this.agents.syncPropertyCount(updated.agentId);

    await this.notifications.createAndPush({
      userId: property.agent.userId,
      type: 'PROPERTY_APPROVED',
      title: 'Listing approved',
      body: `${property.title} is now live on the marketplace.`,
      data: { propertyId: id },
    });

    this.logger.log(`Admin ${admin.id} approved property ${id}`);

    return this.properties.toEntity(updated);
  }

  async rejectProperty(
    id: string,
    reason: string,
    admin: AuthenticatedUser,
  ): Promise<PropertyEntity> {
    const property = await this.loadPropertyOrThrow(id);

    if (property.status === PropertyStatus.REJECTED) {
      throw new BadRequestException('This property is already rejected');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        status: PropertyStatus.REJECTED,
        isApproved: false,
        isPublished: false,
        rejectionReason: reason,
      },
      include: ADMIN_PROPERTY_INCLUDE,
    });

    await this.agents.syncPropertyCount(updated.agentId);

    await this.notifications.createAndPush({
      userId: property.agent.userId,
      type: 'PROPERTY_REJECTED',
      title: 'Listing needs changes',
      body: `${property.title} was not approved. Reason: ${reason}`,
      data: { propertyId: id, reason },
    });

    this.logger.log(`Admin ${admin.id} rejected property ${id}`);

    return this.properties.toEntity(updated);
  }

  /**
   * Featuring is an editorial decision, so it lives here rather than on the
   * agent-facing property update endpoint.
   */
  async setPropertyFeatured(
    id: string,
    isFeatured: boolean,
    admin: AuthenticatedUser,
  ): Promise<PropertyEntity> {
    const property = await this.loadPropertyOrThrow(id);

    if (isFeatured && !property.isApproved) {
      throw new BadRequestException('Only an approved listing can be featured');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: { isFeatured },
      include: ADMIN_PROPERTY_INCLUDE,
    });

    this.logger.log(
      `Admin ${admin.id} ${isFeatured ? 'featured' : 'unfeatured'} property ${id}`,
    );

    return this.properties.toEntity(updated);
  }

  async setAgentVerified(id: string, isVerified: boolean): Promise<{ message: string }> {
    await this.agents.assertExists(id);

    await this.prisma.agent.update({ where: { id }, data: { isVerified } });

    return {
      message: isVerified ? 'Agent marked as verified' : 'Agent verification removed',
    };
  }

  private async loadPropertyOrThrow(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        isApproved: true,
        agentId: true,
        agent: { select: { userId: true } },
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID "${id}" was not found`);
    }

    return property;
  }
}
