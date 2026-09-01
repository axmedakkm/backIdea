import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class NotificationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Recipient user ID' })
  userId!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ example: 'New viewing request' })
  title!: string;

  @ApiProperty({ example: 'Sofia Almeida requested a viewing of your listing.' })
  body!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Deep-linking payload, for example { "propertyId": "..." }',
    example: { propertyId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
  })
  data!: unknown;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiPropertyOptional({ nullable: true })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class UnreadCountEntity {
  @ApiProperty({ example: 3, description: 'Number of unread notifications' })
  unread!: number;
}
