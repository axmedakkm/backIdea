import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessageOnlyEntity } from '../auth/entities/auth-response.entity';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { NotificationEntity, UnreadCountEntity } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiMessage('Notifications retrieved successfully')
  @ApiOperation({
    summary: 'List your notifications',
    description:
      'Returns notifications addressed to the signed-in user, newest first. ' +
      'Filter by read state or type. Notifications are also delivered live over ' +
      'Socket.IO as `notification` events.',
  })
  @ApiPaginatedResponse(NotificationEntity, 'Paginated list of notifications')
  @ApiBadRequestResponse({ description: 'Invalid query parameters', type: ApiErrorResponse })
  findAll(@CurrentUser('id') userId: string, @Query() query: QueryNotificationDto) {
    return this.notificationsService.findAll(userId, query);
  }

  @Get('unread-count')
  @ApiMessage('Unread count retrieved successfully')
  @ApiOperation({
    summary: 'Count unread notifications',
    description: 'Convenience endpoint for rendering a badge without fetching the full list.',
  })
  @ApiOkResponse({ description: 'Unread count', type: UnreadCountEntity })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.unreadCount(userId);
  }

  // Declared before `:id/read` so "read-all" is not parsed as a UUID.
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('All notifications marked as read')
  @ApiOperation({
    summary: 'Mark every notification as read',
    description: 'Marks all unread notifications for the signed-in user as read.',
  })
  @ApiOkResponse({
    description: 'Notifications updated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'All notifications marked as read' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Marked 4 notification(s) as read' },
            updated: { type: 'number', example: 4 },
          },
        },
      },
    },
  })
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Notification marked as read')
  @ApiOperation({
    summary: 'Mark a notification as read',
    description: 'You can only mark your own notifications as read.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification updated', type: NotificationEntity })
  @ApiBadRequestResponse({ description: 'Malformed UUID', type: ApiErrorResponse })
  @ApiNotFoundResponse({
    description: 'Notification not found or belongs to another user',
    type: ApiErrorResponse,
  })
  markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notificationsService.markAsRead(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Notification deleted successfully')
  @ApiOperation({
    summary: 'Delete a notification',
    description: 'You can only delete your own notifications.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification deleted', type: MessageOnlyEntity })
  @ApiNotFoundResponse({
    description: 'Notification not found or belongs to another user',
    type: ApiErrorResponse,
  })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notificationsService.remove(userId, id);
  }
}
