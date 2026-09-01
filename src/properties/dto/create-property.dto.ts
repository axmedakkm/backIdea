import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PricePeriod, PropertyPurpose, PropertyType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PropertyFeatureDto {
  @ApiProperty({ example: 'Heating', maxLength: 80 })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Central gas', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200)
  value?: string;
}

export class CreatePropertyDto {
  @ApiProperty({ example: 'Sunlit Two-Bedroom in Williamsburg', minLength: 5, maxLength: 160 })
  @IsString()
  @Transform(trim)
  @MinLength(5)
  @MaxLength(160)
  title!: string;

  @ApiProperty({
    example: 'A south-facing corner unit with original hardwood floors and a private balcony.',
    minLength: 20,
    maxLength: 5000,
  })
  @IsString()
  @Transform(trim)
  @MinLength(20, { message: 'description must be at least 20 characters long' })
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ example: 685000, minimum: 0.01, description: 'Asking price or rent' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price must have at most 2 decimal places' })
  @IsPositive({ message: 'price must be greater than zero' })
  @Max(999_999_999_999, { message: 'price exceeds the supported maximum' })
  price!: number;

  @ApiPropertyOptional({
    example: 'USD',
    default: 'USD',
    minLength: 3,
    maxLength: 3,
    description: 'ISO 4217 currency code',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Length(3, 3, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;

  @ApiPropertyOptional({
    enum: PricePeriod,
    default: PricePeriod.ONE_TIME,
    description: 'Billing period. Use ONE_TIME for sales, MONTHLY/YEARLY for rentals.',
  })
  @IsOptional()
  @IsEnum(PricePeriod)
  pricePeriod?: PricePeriod;

  @ApiProperty({ enum: PropertyPurpose, example: PropertyPurpose.SALE })
  @IsEnum(PropertyPurpose, { message: 'purpose must be SALE or RENT' })
  purpose!: PropertyPurpose;

  @ApiProperty({ enum: PropertyType, example: PropertyType.APARTMENT })
  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  bathrooms?: number;

  @ApiProperty({ example: 89.5, minimum: 0.01, description: 'Floor area in square metres' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'area must be greater than zero' })
  @Max(10_000_000)
  area!: number;

  @ApiPropertyOptional({ example: 1998, minimum: 1800, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(2100)
  yearBuilt?: number;

  @ApiPropertyOptional({ example: 4, minimum: -10, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-10)
  @Max(200)
  floor?: number;

  @ApiPropertyOptional({ example: 12, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  totalFloors?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  parkingSpaces?: number;

  @ApiProperty({ example: '112 Berry Street, Apt 4B', maxLength: 250 })
  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(250)
  address!: string;

  @ApiProperty({ example: 'New York', maxLength: 80 })
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

  @ApiProperty({ example: 'United States', maxLength: 80 })
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(80)
  country!: string;

  @ApiPropertyOptional({ example: 40.7145, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -73.9613, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Category this listing belongs to' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Structured location reference' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Submit the listing for moderation. A published listing enters PENDING status and ' +
      'only becomes publicly visible once an admin approves it.',
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    type: [PropertyFeatureDto],
    maxItems: 50,
    description: 'Amenities and specifications shown on the listing page',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'a property may have at most 50 features' })
  @ValidateNested({ each: true })
  @Type(() => PropertyFeatureDto)
  features?: PropertyFeatureDto[];

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Assign the listing to a specific agent. ADMIN only; agents always create listings ' +
      'under their own profile.',
  })
  @IsOptional()
  @IsUUID('4')
  agentId?: string;
}
