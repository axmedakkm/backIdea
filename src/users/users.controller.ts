import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { MessageOnlyEntity, UserProfileEntity } from '../auth/entities/auth-response.entity';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token', type: ApiErrorResponse })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiMessage('Profile retrieved successfully')
  @ApiOperation({
    summary: 'Get the signed-in user profile',
    description: 'Returns the account belonging to the bearer token. Never includes password data.',
  })
  @ApiOkResponse({ description: 'Profile returned', type: UserProfileEntity })
  @ApiNotFoundResponse({ description: 'Account not found', type: ApiErrorResponse })
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findMe(userId);
  }

  @Patch('me')
  @ApiMessage('Profile updated successfully')
  @ApiOperation({
    summary: 'Update the signed-in user profile',
    description:
      'Updates name, phone and/or avatar. A user can only ever modify their own profile — ' +
      'the target is taken from the token, not from the request body.',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: 'Profile updated', type: UserProfileEntity })
  @ApiBadRequestResponse({ description: 'Validation failed or empty body', type: ApiErrorResponse })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(userId, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Password changed successfully')
  @ApiOperation({
    summary: 'Change the account password',
    description:
      'Requires the current password. On success all refresh tokens are revoked, ' +
      'so other devices must sign in again.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: 'Password changed', type: MessageOnlyEntity })
  @ApiBadRequestResponse({
    description: 'New password is too weak or identical to the current one',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Current password incorrect', type: ApiErrorResponse })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(userId, dto);
  }

  @Patch('me/email')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Email address updated successfully')
  @ApiOperation({
    summary: 'Change the account email address',
    description:
      'Requires the current password. The new address is marked unverified until confirmed.',
  })
  @ApiBody({ type: ChangeEmailDto })
  @ApiOkResponse({ description: 'Email updated', type: UserProfileEntity })
  @ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Password incorrect', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Email already in use', type: ApiErrorResponse })
  changeEmail(@CurrentUser('id') userId: string, @Body() dto: ChangeEmailDto) {
    return this.usersService.changeEmail(userId, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Account deleted successfully')
  @ApiOperation({
    summary: 'Delete the signed-in account',
    description:
      'Performs a soft delete: the account is deactivated and its email released, ' +
      'while related records keep their references intact. This action cannot be undone.',
  })
  @ApiOkResponse({ description: 'Account deleted', type: MessageOnlyEntity })
  @ApiNotFoundResponse({ description: 'Account not found', type: ApiErrorResponse })
  deleteMe(@CurrentUser('id') userId: string) {
    return this.usersService.deleteMe(userId);
  }
}
