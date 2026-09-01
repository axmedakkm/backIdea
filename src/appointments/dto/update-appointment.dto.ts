import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAppointmentDto {
  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-09-16T14:30:00.000Z',
    description: 'Reschedule the viewing. Must be in the future.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO 8601 date-time string' })
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 90, minimum: 15, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMin?: number;

  @ApiPropertyOptional({
    enum: AppointmentStatus,
    description:
      'The requesting user may only CANCEL. The listing agent (and admins) may CONFIRM, ' +
      'CANCEL or mark COMPLETED.',
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    example: 'Buyer proceeded with another property.',
    maxLength: 500,
    description: 'Recorded when status is set to CANCELLED',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(500)
  cancelReason?: string;
}
