import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportTargetType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({
    enum: ReportTargetType,
    description: 'What kind of entity is being reported',
  })
  @IsEnum(ReportTargetType, {
    message: 'targetType must be one of PROPERTY, AGENT, USER, REVIEW',
  })
  targetType!: ReportTargetType;

  @ApiProperty({ format: 'uuid', description: 'ID of the reported property, agent, user or review' })
  @IsUUID('4', { message: 'targetId must be a valid UUID' })
  targetId!: string;

  @ApiProperty({
    example: 'Listing photographs do not match the property',
    minLength: 5,
    maxLength: 200,
    description: 'Short summary of the problem',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(5)
  @MaxLength(200)
  reason!: string;

  @ApiPropertyOptional({
    example: 'The interior photos appear to be from a different unit in the same building.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(2000)
  description?: string;
}
