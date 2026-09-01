import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthSessionEntity,
  AuthTokensEntity,
  DevTokenEntity,
  MessageOnlyEntity,
} from './entities/auth-response.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded for this endpoint',
  type: ApiErrorResponse,
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiMessage('Account created successfully')
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a USER or AGENT account and immediately returns a signed-in session. ' +
      'Choosing `role: AGENT` also provisions the associated agent profile. ' +
      'ADMIN accounts cannot be created here. Limited to 5 requests per minute per IP.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'Account created and session issued',
    type: AuthSessionEntity,
  })
  @ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorResponse })
  @ApiConflictResponse({ description: 'Email address already registered', type: ApiErrorResponse })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiMessage('Signed in successfully')
  @ApiOperation({
    summary: 'Sign in with email and password',
    description:
      'Returns an access token, a refresh token and the user profile. ' +
      'Limited to 10 requests per minute per IP to slow credential stuffing.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authentication succeeded', type: AuthSessionEntity })
  @ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or deactivated account',
    type: ApiErrorResponse,
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiMessage('Tokens refreshed successfully')
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'Refresh tokens are single-use: a successful call rotates both tokens. ' +
      'Presenting an already-rotated token ends the session as a replay-protection measure.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: 'New token pair issued', type: AuthTokensEntity })
  @ApiUnauthorizedResponse({
    description: 'Refresh token invalid, expired or already used',
    type: ApiErrorResponse,
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Signed out successfully')
  @ApiOperation({
    summary: 'Sign out the current session',
    description:
      'Clears the stored refresh token so it can no longer be exchanged. ' +
      'The current access token remains valid until it expires.',
  })
  @ApiOkResponse({ description: 'Session ended', type: MessageOnlyEntity })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token', type: ApiErrorResponse })
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiMessage('Password reset requested')
  @ApiOperation({
    summary: 'Request a password reset token',
    description:
      'Always responds with the same message whether or not the email is registered, ' +
      'so the endpoint cannot be used to discover accounts. ' +
      'Outside production the raw token is included in the response for testing. ' +
      'Limited to 3 requests per minute per IP.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: 'Request accepted', type: DevTokenEntity })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiMessage('Password reset successfully')
  @ApiOperation({
    summary: 'Set a new password using a reset token',
    description:
      'Consumes the single-use token from /auth/forgot-password and invalidates all active sessions.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Password updated', type: MessageOnlyEntity })
  @ApiBadRequestResponse({
    description: 'Token invalid or expired, or password too weak',
    type: ApiErrorResponse,
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiMessage('Email verified successfully')
  @ApiOperation({
    summary: 'Confirm an email address',
    description:
      'Consumes the single-use token issued at registration. Tokens expire after 24 hours.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({ description: 'Email verified', type: MessageOnlyEntity })
  @ApiBadRequestResponse({ description: 'Token invalid or expired', type: ApiErrorResponse })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }
}
