import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const APPOINTMENT_SORT_FIELDS = ['scheduledAt', 'createdAt', 'status'] as const;
export type AppointmentSortField = (typeof APPOINTMENT_SORT_FIELDS)[number];

export enum AppointmentRole {
  /** Appointments the caller requested. */
  REQUESTER = 'requester',
  /** Appointments on the caller's own listings (agents only). */
  AGENT = 'agent',
  /** Both of the above. */
  ALL = 'all',
}

export class QueryAppointmentDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter to a single property' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({
    enum: AppointmentRole,
    default: AppointmentRole.ALL,
    description:
      'Which side of the appointment you want. `requester` returns viewings you booked, ' +
      '`agent` returns viewings booked on your listings.',
  })
  @IsOptional()
  @IsEnum(AppointmentRole)
  role: AppointmentRole = AppointmentRole.ALL;

  @ApiPropertyOptional({ format: 'date-time', description: 'Only appointments at or after this time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Only appointments at or before this time' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: APPOINTMENT_SORT_FIELDS, default: 'scheduledAt' })
  @IsOptional()
  @IsIn(APPOINTMENT_SORT_FIELDS)
  sortBy: AppointmentSortField = 'scheduledAt';
}
