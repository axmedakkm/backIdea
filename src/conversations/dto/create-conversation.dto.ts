import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The other participant. A conversation is always between exactly two people; ' +
      'if one already exists for this pair and property it is returned instead of a duplicate.',
  })
  @IsUUID('4', { message: 'participantId must be a valid UUID' })
  participantId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The listing this conversation is about. Sets the default conversation title.',
  })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'Optional first message, sent immediately after the conversation is created',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(5000)
  message?: string;
}
