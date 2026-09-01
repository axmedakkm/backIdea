import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationEntity, MessageEntity } from './entities/conversation.entity';

@ApiTags('Conversations')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Conversation created successfully')
  @ApiOperation({
    summary: 'Start a conversation',
    description:
      'Opens a thread with another user, optionally about a specific listing and with a ' +
      'first message. If a thread already exists between the same two people for the same ' +
      'property, that thread is returned instead of creating a duplicate.',
  })
  @ApiBody({ type: CreateConversationDto })
  @ApiCreatedResponse({ description: 'Conversation ready', type: ConversationEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed or attempted to message yourself',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'Participant or property not found', type: ApiErrorResponse })
  create(@Body() dto: CreateConversationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.conversationsService.create(dto, actor);
  }

  @Get()
  @ApiMessage('Conversations retrieved successfully')
  @ApiOperation({
    summary: 'List your conversations',
    description:
      'Returns only threads you participate in, most recently active first, each with its ' +
      'last message and your unread count.',
  })
  @ApiPaginatedResponse(ConversationEntity, 'Paginated list of conversations')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@CurrentUser() actor: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.conversationsService.findAll(actor, query);
  }

  @Get(':id')
  @ApiMessage('Conversation retrieved successfully')
  @ApiOperation({
    summary: 'Get a conversation',
    description:
      'Only participants can read a thread. Non-participants receive 404 rather than 403, ' +
      'so conversation IDs cannot be probed. Administrators are not exempt.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Conversation ID' })
  @ApiOkResponse({ description: 'Conversation found', type: ConversationEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({
    description: 'Conversation not found or you are not a participant',
    type: ApiErrorResponse,
  })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.findOne(id, actor);
  }

  @Get(':id/messages')
  @ApiMessage('Messages retrieved successfully')
  @ApiOperation({
    summary: 'List messages in a conversation',
    description:
      'Only participants can read messages. Fetching a page also marks the other ' +
      "party's messages as read and emits a `messageRead` event to the room.",
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Conversation ID' })
  @ApiPaginatedResponse(MessageEntity, 'Paginated list of messages')
  @ApiNotFoundResponse({
    description: 'Conversation not found or you are not a participant',
    type: ApiErrorResponse,
  })
  findMessages(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.conversationsService.findMessages(id, actor, query);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Message sent successfully')
  @ApiOperation({
    summary: 'Send a message',
    description:
      'Only participants can post. The message is broadcast to the conversation room as a ' +
      '`newMessage` Socket.IO event, and the other participant receives a NEW_MESSAGE ' +
      'notification. IMAGE and VOICE messages require `mediaUrl`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Conversation ID' })
  @ApiBody({ type: CreateMessageDto })
  @ApiCreatedResponse({ description: 'Message sent', type: MessageEntity })
  @ApiBadRequestResponse({
    description: 'Validation failed, or mediaUrl missing for a media message',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({
    description: 'Conversation not found or you are not a participant',
    type: ApiErrorResponse,
  })
  sendMessage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.sendMessage(id, dto, actor);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Conversation marked as read')
  @ApiOperation({
    summary: 'Mark a conversation as read',
    description:
      "Marks every message from the other participant as read and emits `messageRead` to the room.",
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Conversation ID' })
  @ApiOkResponse({
    description: 'Messages marked as read',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Conversation marked as read' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Marked 3 message(s) as read' },
            updated: { type: 'number', example: 3 },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Conversation not found or you are not a participant',
    type: ApiErrorResponse,
  })
  async markRead(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.conversationsService.loadParticipatingOrThrow(id, actor);
    return this.conversationsService.markRead(id, actor.id);
  }
}
