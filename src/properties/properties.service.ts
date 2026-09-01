import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PropertyStatus,
  UserRole,
} from '@prisma/client';
import { AgentsService } from '../agents/agents.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { slugify, slugifyWithSuffix } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { QueryPropertyDto } from './dto/query-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyEntity } from './entities/property.entity';

const PROPERTY_INCLUDE = {
  agent: {
    include: {
      user: { select: { name: true, email: true, phone: true, avatar: true } },
    },
  },
  category: true,
  location: true,
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  features: { orderBy: { name: 'asc' } },
  _count: { select: { favorites: true } },
} satisfies Prisma.PropertyInclude;

type PropertyWithRelations = Prisma.PropertyGetPayload<{ include: typeof PROPERTY_INCLUDE }>;

/** Statuses an owner may set directly; moderation statuses are admin-only. */
const OWNER_SETTABLE_STATUSES: PropertyStatus[] = [
  PropertyStatus.DRAFT,
  PropertyStatus.SOLD,
  PropertyStatus.RENTED,
];

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
  ) {}

  // -------------------------------------------------------------------------
  //  Create
  // -------------------------------------------------------------------------

  async create(dto: CreatePropertyDto, actor: AuthenticatedUser): Promise<PropertyEntity> {
    const agentId = await this.resolveOwningAgent(dto.agentId, actor);

    await this.assertReferencesExist(dto.categoryId, dto.locationId);
    this.assertFloorConsistency(dto.floor, dto.totalFloors);

    const slug = await this.generateUniqueSlug(dto.title);
    const isPublished = dto.isPublished ?? false;

    const property = await this.prisma.property.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        currency: dto.currency ?? 'USD',
        pricePeriod: dto.pricePeriod,
        purpose: dto.purpose,
        propertyType: dto.propertyType,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        area: dto.area,
        yearBuilt: dto.yearBuilt,
        floor: dto.floor,
        totalFloors: dto.totalFloors,
        parkingSpaces: dto.parkingSpaces ?? 0,
        address: dto.address,
        city: dto.city,
        district: dto.district,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isPublished,
        // Publishing submits for moderation rather than going live immediately.
        status: isPublished ? PropertyStatus.PENDING : PropertyStatus.DRAFT,
        isApproved: false,
        agentId,
        categoryId: dto.categoryId,
        locationId: dto.locationId,
        ...(dto.features?.length
          ? {
              features: {
                create: this.dedupeFeatures(dto.features),
              },
            }
          : {}),
      },
      include: PROPERTY_INCLUDE,
    });

    this.logger.log(`Agent ${agentId} created property ${property.id}`);

    return this.toEntity(property);
  }

  // -------------------------------------------------------------------------
  //  Read
  // -------------------------------------------------------------------------

  async findAll(
    query: QueryPropertyDto,
    actor?: AuthenticatedUser,
    forceAgentId?: string,
  ): Promise<PaginatedResult<PropertyEntity>> {
    const where = this.buildWhere(query, actor, forceAgentId);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: PROPERTY_INCLUDE,
      }),
      this.prisma.property.count({ where }),
    ]);

    const favorited = await this.favoritedIds(
      actor?.id,
      items.map((item) => item.id),
    );

    return paginate(
      items.map((item) => this.toEntity(item, favorited)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string, actor?: AuthenticatedUser): Promise<PropertyEntity> {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: PROPERTY_INCLUDE,
    });

    if (!property || !this.canView(property, actor)) {
      throw new NotFoundException(`Property with ID "${id}" was not found`);
    }

    await this.registerView(property.id, actor);

    const favorited = await this.favoritedIds(actor?.id, [property.id]);
    return this.toEntity(property, favorited);
  }

  async findBySlug(slug: string, actor?: AuthenticatedUser): Promise<PropertyEntity> {
    const property = await this.prisma.property.findFirst({
      where: { slug, deletedAt: null },
      include: PROPERTY_INCLUDE,
    });

    if (!property || !this.canView(property, actor)) {
      throw new NotFoundException(`Property with slug "${slug}" was not found`);
    }

    await this.registerView(property.id, actor);

    const favorited = await this.favoritedIds(actor?.id, [property.id]);
    return this.toEntity(property, favorited);
  }

  /**
   * Side-by-side comparison. Only publicly visible listings are comparable,
   * so the endpoint cannot be used to probe unapproved listings.
   */
  async compare(ids: string[], actor?: AuthenticatedUser): Promise<PropertyEntity[]> {
    const unique = [...new Set(ids)];

    const properties = await this.prisma.property.findMany({
      where: { id: { in: unique }, deletedAt: null },
      include: PROPERTY_INCLUDE,
    });

    const visible = properties.filter((property) => this.canView(property, actor));

    if (visible.length !== unique.length) {
      const found = new Set(visible.map((p) => p.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new NotFoundException(
        `The following properties were not found or are not available: ${missing.join(', ')}`,
      );
    }

    const favorited = await this.favoritedIds(actor?.id, unique);

    // Preserve the caller's requested ordering.
    const byId = new Map(visible.map((property) => [property.id, property]));
    return unique.map((id) => this.toEntity(byId.get(id)!, favorited));
  }

  async findByAgent(
    agentId: string,
    query: QueryPropertyDto,
    actor?: AuthenticatedUser,
  ): Promise<PaginatedResult<PropertyEntity>> {
    await this.agentsService.assertExists(agentId);

    // The agent is passed as a separate argument rather than spread into the
    // DTO: spreading a class instance drops the `skip` getter, which would
    // silently disable pagination on this endpoint.
    return this.findAll(query, actor, agentId);
  }

  // -------------------------------------------------------------------------
  //  Update & delete
  // -------------------------------------------------------------------------

  async update(
    id: string,
    dto: UpdatePropertyDto,
    actor: AuthenticatedUser,
  ): Promise<PropertyEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const existing = await this.findOwnedOrThrow(id, actor);

    await this.assertReferencesExist(dto.categoryId, dto.locationId);

    this.assertFloorConsistency(
      dto.floor !== undefined ? dto.floor : existing.floor,
      dto.totalFloors !== undefined ? dto.totalFloors : existing.totalFloors,
    );

    if (dto.status && actor.role !== UserRole.ADMIN) {
      if (!OWNER_SETTABLE_STATUSES.includes(dto.status)) {
        throw new ForbiddenException(
          `Only an administrator can set status to ${dto.status}. ` +
            `Allowed values: ${OWNER_SETTABLE_STATUSES.join(', ')}.`,
        );
      }
    }

    const data: Prisma.PropertyUpdateInput = {
      ...(dto.title !== undefined
        ? { title: dto.title, slug: await this.generateUniqueSlug(dto.title, id) }
        : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.pricePeriod !== undefined ? { pricePeriod: dto.pricePeriod } : {}),
      ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
      ...(dto.propertyType !== undefined ? { propertyType: dto.propertyType } : {}),
      ...(dto.bedrooms !== undefined ? { bedrooms: dto.bedrooms } : {}),
      ...(dto.bathrooms !== undefined ? { bathrooms: dto.bathrooms } : {}),
      ...(dto.area !== undefined ? { area: dto.area } : {}),
      ...(dto.yearBuilt !== undefined ? { yearBuilt: dto.yearBuilt } : {}),
      ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
      ...(dto.totalFloors !== undefined ? { totalFloors: dto.totalFloors } : {}),
      ...(dto.parkingSpaces !== undefined ? { parkingSpaces: dto.parkingSpaces } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.district !== undefined ? { district: dto.district } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.categoryId !== undefined
        ? { category: dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true } }
        : {}),
      ...(dto.locationId !== undefined
        ? { location: dto.locationId ? { connect: { id: dto.locationId } } : { disconnect: true } }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    // Re-publishing an edited listing sends it back through moderation.
    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;

      if (dto.isPublished && !existing.isApproved) {
        data.status = PropertyStatus.PENDING;
      } else if (!dto.isPublished) {
        data.status = dto.status ?? PropertyStatus.DRAFT;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.features !== undefined) {
        // Features are replaced wholesale rather than diffed.
        await tx.propertyFeature.deleteMany({ where: { propertyId: id } });

        if (dto.features.length) {
          await tx.propertyFeature.createMany({
            data: this.dedupeFeatures(dto.features).map((feature) => ({
              ...feature,
              propertyId: id,
            })),
          });
        }
      }

      return tx.property.update({ where: { id }, data, include: PROPERTY_INCLUDE });
    });

    await this.agentsService.syncPropertyCount(updated.agentId);

    return this.toEntity(updated);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<{ message: string }> {
    const existing = await this.findOwnedOrThrow(id, actor);

    await this.prisma.property.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isPublished: false,
        // Free the slug so a future listing can reuse the same title.
        slug: `${existing.slug}-deleted-${Date.now()}`,
      },
    });

    await this.agentsService.syncPropertyCount(existing.agentId);

    this.logger.log(`Property ${id} soft-deleted by user ${actor.id}`);

    return { message: 'Property deleted successfully' };
  }

  // -------------------------------------------------------------------------
  //  Authorization helpers
  // -------------------------------------------------------------------------

  /**
   * Loads a property and confirms the actor may modify it.
   * Admins may modify anything; agents only their own listings.
   */
  async findOwnedOrThrow(id: string, actor: AuthenticatedUser) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        slug: true,
        agentId: true,
        isApproved: true,
        floor: true,
        totalFloors: true,
        agent: { select: { userId: true } },
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID "${id}" was not found`);
    }

    if (actor.role === UserRole.ADMIN) {
      return property;
    }

    if (property.agent.userId !== actor.id) {
      throw new ForbiddenException('You can only manage properties from your own listings');
    }

    return property;
  }

  /** A listing is public once approved and published; owners and admins always see theirs. */
  private canView(
    property: { isApproved: boolean; isPublished: boolean; agent: { userId: string } },
    actor?: AuthenticatedUser,
  ): boolean {
    if (property.isApproved && property.isPublished) {
      return true;
    }

    if (!actor) {
      return false;
    }

    return actor.role === UserRole.ADMIN || property.agent.userId === actor.id;
  }

  private async resolveOwningAgent(
    requestedAgentId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<string> {
    if (actor.role === UserRole.ADMIN) {
      if (!requestedAgentId) {
        throw new BadRequestException(
          'An administrator must specify agentId when creating a property',
        );
      }

      await this.agentsService.assertExists(requestedAgentId);
      return requestedAgentId;
    }

    // A non-admin can never create a listing under someone else's profile.
    if (requestedAgentId && requestedAgentId !== actor.agentId) {
      throw new ForbiddenException('You can only create properties under your own agent profile');
    }

    if (!actor.agentId) {
      throw new ForbiddenException(
        'Your account does not have an agent profile. Register as an AGENT to list properties.',
      );
    }

    return actor.agentId;
  }

  // -------------------------------------------------------------------------
  //  Query building
  // -------------------------------------------------------------------------

  private buildWhere(
    query: QueryPropertyDto,
    actor?: AuthenticatedUser,
    forceAgentId?: string,
  ): Prisma.PropertyWhereInput {
    const insensitive = Prisma.QueryMode.insensitive;
    const agentId = forceAgentId ?? query.agentId;

    const filters: Prisma.PropertyWhereInput = {
      deletedAt: null,
      ...(query.city ? { city: { equals: query.city, mode: insensitive } } : {}),
      ...(query.district ? { district: { equals: query.district, mode: insensitive } } : {}),
      ...(query.country ? { country: { equals: query.country, mode: insensitive } } : {}),
      ...(query.propertyType ? { propertyType: query.propertyType } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(agentId ? { agentId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
      // Bedroom/bathroom counts filter as "at least N", which is what buyers expect.
      ...(query.bedrooms !== undefined ? { bedrooms: { gte: query.bedrooms } } : {}),
      ...(query.bathrooms !== undefined ? { bathrooms: { gte: query.bathrooms } } : {}),
    };

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filters.price = {
        ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
        ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {}),
      };
    }

    if (query.minArea !== undefined || query.maxArea !== undefined) {
      filters.area = {
        ...(query.minArea !== undefined ? { gte: query.minArea } : {}),
        ...(query.maxArea !== undefined ? { lte: query.maxArea } : {}),
      };
    }

    if (query.search) {
      filters.OR = [
        { title: { contains: query.search, mode: insensitive } },
        { description: { contains: query.search, mode: insensitive } },
        { address: { contains: query.search, mode: insensitive } },
        { city: { contains: query.search, mode: insensitive } },
        { district: { contains: query.search, mode: insensitive } },
      ];
    }

    return { AND: [filters, this.visibilityScope(query, actor)] };
  }

  /**
   * Restricts the result set to what the caller is entitled to see.
   * Anonymous and ordinary users see approved, published listings only.
   */
  private visibilityScope(
    query: QueryPropertyDto,
    actor?: AuthenticatedUser,
  ): Prisma.PropertyWhereInput {
    const publiclyVisible: Prisma.PropertyWhereInput = {
      isApproved: true,
      isPublished: true,
      status: PropertyStatus.APPROVED,
    };

    if (actor?.role === UserRole.ADMIN) {
      return query.status ? { status: query.status } : {};
    }

    if (actor?.agentId) {
      // Agents additionally see every listing of their own, at any status.
      return {
        OR: [
          query.status ? { AND: [publiclyVisible, { status: query.status }] } : publiclyVisible,
          {
            agentId: actor.agentId,
            ...(query.status ? { status: query.status } : {}),
          },
        ],
      };
    }

    return publiclyVisible;
  }

  // -------------------------------------------------------------------------
  //  Misc helpers
  // -------------------------------------------------------------------------

  private async assertReferencesExist(categoryId?: string, locationId?: string): Promise<void> {
    if (categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: categoryId, deletedAt: null },
        select: { id: true },
      });

      if (!category) {
        throw new BadRequestException(`Category with ID "${categoryId}" was not found`);
      }
    }

    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: locationId, deletedAt: null },
        select: { id: true },
      });

      if (!location) {
        throw new BadRequestException(`Location with ID "${locationId}" was not found`);
      }
    }
  }

  private assertFloorConsistency(floor?: number | null, totalFloors?: number | null): void {
    if (floor != null && totalFloors != null && floor > totalFloors) {
      throw new BadRequestException('floor cannot be greater than totalFloors');
    }
  }

  /** Later duplicates win, mirroring the unique (propertyId, name) constraint. */
  private dedupeFeatures(features: { name: string; value?: string }[]) {
    const byName = new Map<string, { name: string; value?: string }>();

    for (const feature of features) {
      byName.set(feature.name.toLowerCase(), feature);
    }

    return [...byName.values()];
  }

  private async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    const base = slugify(title) || 'property';

    const clash = await this.prisma.property.findFirst({
      where: { slug: base, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });

    return clash ? slugifyWithSuffix(title) : base;
  }

  /** Which of the given properties the user has favourited. */
  private async favoritedIds(userId: string | undefined, propertyIds: string[]): Promise<Set<string>> {
    if (!userId || propertyIds.length === 0) {
      return new Set();
    }

    const favorites = await this.prisma.favorite.findMany({
      where: { userId, propertyId: { in: propertyIds } },
      select: { propertyId: true },
    });

    return new Set(favorites.map((favorite) => favorite.propertyId));
  }

  /** Increments the view counter, skipping the listing's own agent and admins. */
  private async registerView(propertyId: string, actor?: AuthenticatedUser): Promise<void> {
    if (actor?.role === UserRole.ADMIN) {
      return;
    }

    const owned = actor?.agentId
      ? await this.prisma.property.count({ where: { id: propertyId, agentId: actor.agentId } })
      : 0;

    if (owned > 0) {
      return;
    }

    await this.prisma.property.update({
      where: { id: propertyId },
      data: { viewCount: { increment: 1 } },
    });
  }

  /** Converts Prisma types (Decimal) into JSON-friendly values. */
  toEntity(property: PropertyWithRelations, favorited?: Set<string>): PropertyEntity {
    const { agent, _count, ...rest } = property;

    return {
      ...rest,
      price: property.price.toNumber(),
      agent: {
        id: agent.id,
        name: agent.user.name,
        email: agent.user.email,
        phone: agent.user.phone,
        avatar: agent.user.avatar,
        company: agent.company,
        rating: agent.rating,
        isVerified: agent.isVerified,
      },
      favoriteCount: _count.favorites,
      ...(favorited ? { isFavorited: favorited.has(property.id) } : {}),
    };
  }
}
