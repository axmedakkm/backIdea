import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';

export class AppointmentPropertySummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sunlit Two-Bedroom in Williamsburg' })
  title!: string;

  @ApiProperty({ example: 'sunlit-two-bedroom-in-williamsburg' })
  slug!: string;

  @ApiProperty({ example: '112 Berry Street, Apt 4B' })
  address!: string;

  @ApiProperty({ example: 'New York' })
  city!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Cover image URL' })
  coverImage!: string | null;

  @ApiProperty({ format: 'uuid', description: 'Owning agent ID' })
  agentId!: string;

  @ApiProperty({ example: 'Jordan Rivera', description: 'Owning agent name' })
  agentName!: string;
}

export class AppointmentUserSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sofia Almeida' })
  name!: string;

  @ApiProperty({ example: 'sofia.almeida@example.com' })
  email!: string;

  @ApiPropertyOptional({ nullable: true, example: '+13475550201' })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatar!: string | null;
}

export class AppointmentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  propertyId!: string;

  @ApiProperty({ format: 'uuid', description: 'The user who requested the viewing' })
  userId!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: Date;

  @ApiProperty({ example: 60, description: 'Duration in minutes' })
  durationMin!: number;

  @ApiProperty({ enum: AppointmentStatus })
  status!: AppointmentStatus;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ type: AppointmentPropertySummary })
  property?: AppointmentPropertySummary;

  @ApiPropertyOptional({ type: AppointmentUserSummary })
  user?: AppointmentUserSummary;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
