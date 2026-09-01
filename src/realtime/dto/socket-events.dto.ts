import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CreateMessageDto } from '../../conversations/dto/create-message.dto';

/** Payload for joinConversation, leaveConversation, typing, stopTyping, messageRead. */
export class ConversationIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'conversationId must be a valid UUID' })
  conversationId!: string;
}

/** Payload for the sendMessage socket event. */
export class SocketMessageDto extends CreateMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'conversationId must be a valid UUID' })
  conversationId!: string;
}
