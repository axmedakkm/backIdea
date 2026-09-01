import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const CATEGORY_SORT_FIELDS = ['name', 'sortOrder', 'createdAt'] as const;
export type CategorySortField = (typeof CATEGORY_SORT_FIELDS)[number];

export class QueryCategoryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on category name', example: 'luxury' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by active state', example: true })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: CATEGORY_SORT_FIELDS,
    default: 'sortOrder',
    description: 'Field to sort by',
  })
  @IsOptional()
  @IsIn(CATEGORY_SORT_FIELDS)
  sortBy: CategorySortField = 'sortOrder';
}
