import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateLocationDto {
  @ApiProperty({ example: 'United States', minLength: 2, maxLength: 80 })
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(80)
  country!: string;

  @ApiProperty({ example: 'New York', minLength: 2, maxLength: 80 })
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiPropertyOptional({ example: 'Brooklyn', maxLength: 80 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ example: '450 Bedford Avenue', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: 40.7128, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @ApiPropertyOptional({ example: -74.006, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
