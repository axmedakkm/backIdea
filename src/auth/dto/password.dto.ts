import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jordan.rivera@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Single-use token delivered by the password-reset email',
    example: 'd41d8cd98f00b204e9800998ecf8427e...',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;

  @ApiProperty({ example: 'N3w!Passw0rd', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain an uppercase letter, a lowercase letter and a digit',
  })
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Single-use token delivered by the verification email',
    example: 'a3f1c9e7b2d84056...',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;
}
