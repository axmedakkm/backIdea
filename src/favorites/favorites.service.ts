import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyEntity } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';

const PROPERTY_INCLUDE = {
  agent: { include: { user: { select: { name: true, email: true, phone: true, avatar: true } } } },
  category: true,
  location: true,
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  features: { orderBy: { name: 'asc' } },
  _count: { select: { favorites: true } },
} satisfies Prisma.PropertyInclude;

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<PropertyEntity>> {
    const where: Prisma.FavoriteWhereInput = {
      userId,
      // Hide listings that were removed after being favourited.
      property: { deletedAt: null },
    };

    const [favorites, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: { property: { include: PROPERTY_INCLUDE } },
      }),
      this.prisma.favorite.count({ where }),
    ]);

    const items = favorites.map((favorite) => ({
      ...this.properties.toEntity(favorite.property),
      isFavorited: true,
    }));

    return paginate(items, total, query.page, query.limit);
  }

  async add(userId: string, propertyId: string): Promise<{ message: string }> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: {
        id: true,
        title: true,
        isApproved: true,
        isPublished: true,
        status: true,
        agent: { select: { userId: true } },
      },
    });

    // Only listings that are actually on the market can be saved.
    const isVisible =
      property?.isApproved &&
      property.isPublished &&
      property.status === PropertyStatus.APPROVED;

    if (!property || !isVisible) {
      throw new NotFoundException(`Property with ID "${propertyId}" was not found`);
    }

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('This property is already in your favourites');
    }

    await this.prisma.favorite.create({ data: { userId, propertyId } });

    // Let the agent know their listing was saved, but never notify self-favourites.
    if (property.agent.userId !== userId) {
      await this.notifications.createAndPush({
        userId: property.agent.userId,
        type: 'PROPERTY_FAVORITED',
        title: 'Your listing was saved',
        body: `${property.title} was added to a favourites list.`,
        data: { propertyId: property.id },
      });
    }

    return { message: 'Property added to favourites' };
  }

  async remove(userId: string, propertyId: string): Promise<{ message: string }> {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('This property is not in your favourites');
    }

    await this.prisma.favorite.delete({ where: { id: existing.id } });

    return { message: 'Property removed from favourites' };
  }
}
