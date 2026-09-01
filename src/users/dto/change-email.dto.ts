import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({ example: 'new.address@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'Str0ng!Passw0rd',
    description: 'Current password, required to confirm ownership of the account',
  })
  @IsString()
  @MinLength(1, { message: 'password must not be empty' })
  @MaxLength(72)
  password!: string;
}
