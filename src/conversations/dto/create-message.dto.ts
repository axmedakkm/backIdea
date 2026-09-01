import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    example: 'Is the apartment still available this weekend?',
    minLength: 1,
    maxLength: 5000,
    description: 'Message body. For IMAGE and VOICE messages this acts as the caption.',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'content must not be empty' })
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    enum: MessageType,
    default: MessageType.TEXT,
    description: 'IMAGE and VOICE messages require mediaUrl',
  })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg',
    description: 'Required when type is IMAGE or VOICE',
  })
  @ValidateIf((dto: CreateMessageDto) => dto.type === 'IMAGE' || dto.type === 'VOICE')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'mediaUrl is required and must be a valid URL for IMAGE and VOICE messages' },
  )
  @MaxLength(1000)
  mediaUrl?: string;
}
