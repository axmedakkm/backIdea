import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const REPORT_SORT_FIELDS = ['createdAt', 'status', 'updatedAt'] as const;
export type ReportSortField = (typeof REPORT_SORT_FIELDS)[number];

export class QueryReportDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportTargetType })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter to a specific reported entity' })
  @IsOptional()
  @IsUUID('4')
  targetId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by who filed the report' })
  @IsOptional()
  @IsUUID('4')
  reporterId?: string;

  @ApiPropertyOptional({ enum: REPORT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(REPORT_SORT_FIELDS)
  sortBy: ReportSortField = 'createdAt';
}
