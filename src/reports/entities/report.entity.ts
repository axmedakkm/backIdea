import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus, ReportTargetType } from '@prisma/client';

export class ReportUserSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sofia Almeida' })
  name!: string;

  @ApiProperty({ example: 'sofia.almeida@example.com' })
  email!: string;
}

export class ReportEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reporterId!: string;

  @ApiProperty({ enum: ReportTargetType })
  targetType!: ReportTargetType;

  @ApiProperty({ format: 'uuid', description: 'ID of the reported entity' })
  targetId!: string;

  @ApiProperty({ example: 'Listing photographs do not match the property' })
  reason!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ReportStatus })
  status!: ReportStatus;

  @ApiPropertyOptional({ nullable: true, description: 'Admin note recorded when actioned' })
  resolutionNote!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  resolvedById!: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: Date | null;

  @ApiPropertyOptional({ type: ReportUserSummary })
  reporter?: ReportUserSummary;

  @ApiPropertyOptional({ type: ReportUserSummary, nullable: true })
  resolvedBy?: ReportUserSummary | null;

  @ApiPropertyOptional({
    description:
      'Snapshot of the reported entity (title/name and identifier), resolved at read time',
    example: { label: 'Sunlit Two-Bedroom in Williamsburg', exists: true },
    additionalProperties: true,
  })
  target?: { label: string; exists: boolean } | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
