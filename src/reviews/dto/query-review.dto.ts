import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const REVIEW_SORT_FIELDS = ['createdAt', 'rating'] as const;
export type ReviewSortField = (typeof REVIEW_SORT_FIELDS)[number];

export class QueryReviewDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Return only this exact rating' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ enum: REVIEW_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(REVIEW_SORT_FIELDS)
  sortBy: ReviewSortField = 'createdAt';
}
