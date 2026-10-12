import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType, UserRole } from '@prisma/client';

export class MessageSenderSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jordan Rivera' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  avatar!: string | null;
}

export class MessageEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ format: 'uuid' })
  senderId!: string;

  @ApiProperty({ enum: MessageType })
  type!: MessageType;

  @ApiProperty({ example: 'Is the apartment still available this weekend?' })
  content!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Media URL for IMAGE and VOICE messages' })
  mediaUrl!: string | null;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiPropertyOptional({ nullable: true })
  readAt!: Date | null;

  @ApiPropertyOptional({ type: MessageSenderSummary })
  sender?: MessageSenderSummary;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ConversationParticipantEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Sofia Almeida' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  avatar!: string | null;

  @ApiProperty({
    enum: UserRole,
    description:
      'Lets clients tell an ADMIN participant (the moderation thread) apart from an ' +
      'AGENT or USER one, since a conversation carries no other signal of its kind.',
  })
  role!: UserRole;

  @ApiPropertyOptional({ nullable: true, description: 'When this participant last read the thread' })
  lastReadAt!: Date | null;
}

export class ConversationPropertySummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sunlit Two-Bedroom in Williamsburg' })
  title!: string;

  @ApiProperty({ example: 'sunlit-two-bedroom-in-williamsburg' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  coverImage!: string | null;
}

export class ConversationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Sunlit Two-Bedroom in Williamsburg' })
  title!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  propertyId!: string | null;

  @ApiPropertyOptional({ type: ConversationPropertySummary, nullable: true })
  property?: ConversationPropertySummary | null;

  @ApiProperty({ type: [ConversationParticipantEntity] })
  participants!: ConversationParticipantEntity[];

  @ApiPropertyOptional({ type: MessageEntity, nullable: true, description: 'Most recent message' })
  lastMessage?: MessageEntity | null;

  @ApiProperty({ example: 2, description: 'Messages in this thread the caller has not read' })
  unreadCount!: number;

  @ApiProperty()
  lastMessageAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
