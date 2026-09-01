import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Max, Min, MaxLength, IsNumber } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const AGENT_SORT_FIELDS = ['rating', 'propertyCount', 'reviewCount', 'createdAt'] as const;
export type AgentSortField = (typeof AGENT_SORT_FIELDS)[number];

export class QueryAgentDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive match on agent name or company',
    example: 'rivera',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by the agent primary location' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ example: 'New York', description: 'Filter by city name' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ description: 'Only return admin-verified agents', example: true })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, example: 4, description: 'Minimum average rating' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minRating must be a number' })
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: AGENT_SORT_FIELDS, default: 'rating' })
  @IsOptional()
  @IsIn(AGENT_SORT_FIELDS)
  sortBy: AgentSortField = 'rating';
}
