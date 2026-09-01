import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectPropertyDto {
  @ApiProperty({
    example: 'Listing photographs do not match the stated address.',
    minLength: 5,
    maxLength: 500,
    description: 'Shown to the agent so they know what to correct',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class FeaturePropertyDto {
  @ApiProperty({
    example: true,
    description: 'Whether the listing should appear in featured placements',
  })
  @IsBoolean()
  isFeatured!: boolean;
}

export class VerifyAgentDto {
  @ApiProperty({ example: true, description: 'Whether the agent is verified by ESCA Estate' })
  @IsBoolean()
  isVerified!: boolean;
}

export class SetUserActiveDto {
  @ApiProperty({ example: false, description: 'Set false to suspend the account' })
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional({
    example: 'Repeated policy violations across multiple listings.',
    maxLength: 500,
    description: 'Internal note explaining the action',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(500)
  reason?: string;
}
