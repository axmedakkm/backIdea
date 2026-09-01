import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/** Public projection of a user. Never contains password or token material. */
export class UserProfileEntity {
  @ApiProperty({ format: 'uuid', example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' })
  id!: string;

  @ApiProperty({ example: 'jordan.rivera@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jordan Rivera' })
  name!: string;

  @ApiPropertyOptional({ example: '+13475550123', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
    nullable: true,
  })
  avatar!: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role!: UserRole;

  @ApiProperty({ example: false })
  isEmailVerified!: boolean;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Agent profile ID, present only for AGENT accounts',
  })
  agentId?: string | null;

  @ApiProperty({ example: '2026-08-29T10:15:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-08-29T10:15:00.000Z' })
  updatedAt!: Date;
}

export class AuthTokensEntity {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Short-lived bearer token. Send as `Authorization: Bearer <token>`.',
  })
  accessToken!: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Long-lived token used to obtain a new access token. Store securely.',
  })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds' })
  expiresIn!: number;
}

export class AuthSessionEntity extends AuthTokensEntity {
  @ApiProperty({ type: UserProfileEntity })
  user!: UserProfileEntity;
}

export class MessageOnlyEntity {
  @ApiProperty({ example: 'Operation completed' })
  message!: string;
}

/** Returned by the dev-only flows so tokens can be exercised without an email service. */
export class DevTokenEntity extends MessageOnlyEntity {
  @ApiPropertyOptional({
    description:
      'Present only when NODE_ENV is not "production". Lets you complete the flow without an email provider.',
    example: 'a3f1c9e7b2d84056bd1f...',
  })
  token?: string;
}
