import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ComparePropertiesDto {
  @ApiProperty({
    type: String,
    description: 'Comma-separated list of 2 to 4 property IDs',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301,6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMinSize(2, { message: 'provide at least 2 property IDs to compare' })
  @ArrayMaxSize(4, { message: 'you can compare at most 4 properties at a time' })
  @IsUUID('4', { each: true, message: 'each id must be a valid UUID' })
  ids!: string[];
}
