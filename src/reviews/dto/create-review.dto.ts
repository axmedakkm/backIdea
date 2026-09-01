import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ format: 'uuid', description: 'The agent being reviewed' })
  @IsUUID('4', { message: 'agentId must be a valid UUID' })
  agentId!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 5,
    example: 5,
    description: 'Whole-number star rating from 1 to 5',
  })
  @Type(() => Number)
  @IsInt({ message: 'rating must be a whole number' })
  @Min(1, { message: 'rating must be between 1 and 5' })
  @Max(5, { message: 'rating must be between 1 and 5' })
  rating!: number;

  @ApiPropertyOptional({
    example: 'Knew every building on the block and never oversold a single one.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(2000)
  comment?: string;
}
