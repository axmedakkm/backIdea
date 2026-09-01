import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Str0ng!Passw0rd', description: 'The password currently in use' })
  @IsString()
  @MinLength(1, { message: 'currentPassword must not be empty' })
  @MaxLength(72)
  currentPassword!: string;

  @ApiProperty({ example: 'N3w!Passw0rd', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'newPassword must contain an uppercase letter, a lowercase letter and a digit',
  })
  newPassword!: string;
}
