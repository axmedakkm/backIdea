import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ format: 'uuid', description: 'The property to view' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  propertyId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-15T11:00:00.000Z',
    description: 'When the viewing should take place. Must be in the future.',
  })
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO 8601 date-time string' })
  scheduledAt!: string;

  @ApiPropertyOptional({
    example: 60,
    default: 60,
    minimum: 15,
    maximum: 480,
    description: 'Expected duration in minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMin?: number;

  @ApiPropertyOptional({
    example: 'Interested in the balcony orientation and morning light.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(1000)
  note?: string;
}
