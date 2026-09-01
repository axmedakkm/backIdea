import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin-only moderation payload. */
export class UpdateReportDto {
  @ApiProperty({ enum: ReportStatus, description: 'New moderation status' })
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @ApiPropertyOptional({
    example: 'Listing photographs replaced by the agent; report resolved.',
    maxLength: 2000,
    description: 'Internal note recorded against the report',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(2000)
  resolutionNote?: string;
}
