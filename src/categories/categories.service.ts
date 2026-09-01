import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult, paginate } from '../common/utils/pagination.util';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryEntity } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const slug = slugify(dto.name);

    const clash = await this.prisma.category.findFirst({
      where: { OR: [{ name: dto.name }, { slug }], deletedAt: null },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException('A category with this name already exists');
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(query: QueryCategoryDto): Promise<PaginatedResult<CategoryEntity>> {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(query.search
        ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: query.skip,
        take: query.limit,
        include: {
          _count: {
            select: {
              properties: { where: { deletedAt: null, isPublished: true, isApproved: true } },
            },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    const shaped = items.map(({ _count, ...category }) => ({
      ...category,
      propertyCount: _count.properties,
    }));

    return paginate(shaped, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<CategoryEntity> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            properties: { where: { deletedAt: null, isPublished: true, isApproved: true } },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" was not found`);
    }

    const { _count, ...rest } = category;
    return { ...rest, propertyCount: _count.properties };
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    await this.assertExists(id);

    // Renaming regenerates the slug, so check both for collisions with other rows.
    if (dto.name) {
      const slug = slugify(dto.name);
      const clash = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          OR: [{ name: dto.name }, { slug }],
        },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException('Another category already uses this name');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name, slug: slugify(dto.name) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Soft-deletes the category. Properties keep their reference but the
   * category disappears from listings; a hard delete would orphan listings.
   */
  async remove(id: string): Promise<{ message: string }> {
    await this.assertExists(id);

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { message: 'Category deleted successfully' };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Category with ID "${id}" was not found`);
    }
  }
}
