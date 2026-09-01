import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const LOCATION_SORT_FIELDS = ['country', 'city', 'district', 'createdAt'] as const;
export type LocationSortField = (typeof LOCATION_SORT_FIELDS)[number];

export class QueryLocationDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive match across country, city and district',
    example: 'brooklyn',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ example: 'New York' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: 'Brooklyn' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: LOCATION_SORT_FIELDS, default: 'city' })
  @IsOptional()
  @IsIn(LOCATION_SORT_FIELDS)
  sortBy: LocationSortField = 'city';
}
