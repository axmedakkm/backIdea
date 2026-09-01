import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'jordan.rivera@example.com', description: 'Unique account email' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'Str0ng!Passw0rd',
    minLength: 8,
    maxLength: 72,
    description:
      'Must contain at least one uppercase letter, one lowercase letter and one digit. Max 72 bytes (bcrypt limit).',
  })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @MaxLength(72, { message: 'password must not exceed 72 characters' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain an uppercase letter, a lowercase letter and a digit',
  })
  password!: string;

  @ApiProperty({ example: 'Jordan Rivera', minLength: 2, maxLength: 100 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '+13475550123', description: 'E.164 formatted phone number' })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'phone must be a valid international phone number' })
  phone?: string;

  @ApiPropertyOptional({
    enum: [UserRole.USER, UserRole.AGENT],
    default: UserRole.USER,
    description:
      'Self-registration is limited to USER and AGENT. Registering as AGENT also creates an agent profile. ADMIN accounts can only be provisioned by seeding or an existing admin.',
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role must be either USER or AGENT' })
  role?: UserRole;
}
