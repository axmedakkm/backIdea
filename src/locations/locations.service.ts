import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { QueryLocationDto } from './dto/query-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationEntity } from './entities/location.entity';

const PUBLISHED_PROPERTY_FILTER = {
  deletedAt: null,
  isPublished: true,
  isApproved: true,
} satisfies Prisma.PropertyWhereInput;

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLocationDto): Promise<LocationEntity> {
    const slug = this.buildSlug(dto.country, dto.city, dto.district);

    const clash = await this.prisma.location.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { slug },
          { country: dto.country, city: dto.city, district: dto.district ?? null },
        ],
      },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException(
        'A location with this country, city and district combination already exists',
      );
    }

    return this.prisma.location.create({
      data: {
        country: dto.country,
        city: dto.city,
        district: dto.district,
        address: dto.address,
        slug,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(query: QueryLocationDto): Promise<PaginatedResult<LocationEntity>> {
    const insensitive = Prisma.QueryMode.insensitive;

    const where: Prisma.LocationWhereInput = {
      deletedAt: null,
      ...(query.country ? { country: { equals: query.country, mode: insensitive } } : {}),
      ...(query.city ? { city: { equals: query.city, mode: insensitive } } : {}),
      ...(query.district ? { district: { equals: query.district, mode: insensitive } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { country: { contains: query.search, mode: insensitive } },
              { city: { contains: query.search, mode: insensitive } },
              { district: { contains: query.search, mode: insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: { _count: { select: { properties: { where: PUBLISHED_PROPERTY_FILTER } } } },
      }),
      this.prisma.location.count({ where }),
    ]);

    const shaped = items.map(({ _count, ...location }) => ({
      ...location,
      propertyCount: _count.properties,
    }));

    return paginate(shaped, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<LocationEntity> {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { properties: { where: PUBLISHED_PROPERTY_FILTER } } } },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID "${id}" was not found`);
    }

    const { _count, ...rest } = location;
    return { ...rest, propertyCount: _count.properties };
  }

  async update(id: string, dto: UpdateLocationDto): Promise<LocationEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const current = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, country: true, city: true, district: true },
    });

    if (!current) {
      throw new NotFoundException(`Location with ID "${id}" was not found`);
    }

    // The slug is derived from country/city/district, so recompute when any of them change.
    const country = dto.country ?? current.country;
    const city = dto.city ?? current.city;
    const district = dto.district !== undefined ? dto.district : current.district;
    const slug = this.buildSlug(country, city, district);

    const identityChanged =
      country !== current.country || city !== current.city || district !== current.district;

    if (identityChanged) {
      const clash = await this.prisma.location.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          OR: [{ slug }, { country, city, district: district ?? null }],
        },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException('Another location already uses this country/city/district');
      }
    }

    return this.prisma.location.update({
      where: { id },
      data: {
        country,
        city,
        district,
        slug,
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    const exists = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Location with ID "${id}" was not found`);
    }

    await this.prisma.location.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { message: 'Location deleted successfully' };
  }

  private buildSlug(country: string, city: string, district?: string | null): string {
    return slugify([country, city, district].filter(Boolean).join(' '));
  }
}
