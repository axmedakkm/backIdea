import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PricePeriod,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
} from '@prisma/client';
import { CategoryEntity } from '../../categories/entities/category.entity';
import { LocationEntity } from '../../locations/entities/location.entity';

export class PropertyImageEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/demo/image/upload/v1/listing.jpg' })
  url!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'esca-estate/properties/abc123',
    description: 'Storage provider identifier, used for deletion',
  })
  publicId!: string | null;

  @ApiProperty({ example: true, description: 'Whether this is the listing cover image' })
  isPrimary!: boolean;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class PropertyFeatureEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Heating' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Central gas' })
  value!: string | null;
}

export class PropertyAgentSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jordan Rivera' })
  name!: string;

  @ApiProperty({ example: 'jordan.rivera@example.com' })
  email!: string;

  @ApiPropertyOptional({ nullable: true, example: '+13475550123' })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatar!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Rivera & Co Realty' })
  company!: string | null;

  @ApiProperty({ example: 4.7 })
  rating!: number;

  @ApiProperty({ example: true })
  isVerified!: boolean;
}

export class PropertyEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sunlit Two-Bedroom in Williamsburg' })
  title!: string;

  @ApiProperty({ example: 'sunlit-two-bedroom-in-williamsburg' })
  slug!: string;

  @ApiProperty({ example: 'A south-facing corner unit with original hardwood floors.' })
  description!: string;

  @ApiProperty({
    type: Number,
    example: 685000,
    description: 'Serialised from a NUMERIC(14,2) column',
  })
  price!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ enum: PricePeriod })
  pricePeriod!: PricePeriod;

  @ApiProperty({ enum: PropertyPurpose })
  purpose!: PropertyPurpose;

  @ApiProperty({ enum: PropertyStatus })
  status!: PropertyStatus;

  @ApiProperty({ enum: PropertyType })
  propertyType!: PropertyType;

  @ApiPropertyOptional({ nullable: true, example: 2 })
  bedrooms!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1 })
  bathrooms!: number | null;

  @ApiProperty({ example: 89.5, description: 'Floor area in square metres' })
  area!: number;

  @ApiPropertyOptional({ nullable: true, example: 1998 })
  yearBuilt!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4 })
  floor!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12 })
  totalFloors!: number | null;

  @ApiProperty({ example: 1 })
  parkingSpaces!: number;

  @ApiProperty({ example: '112 Berry Street, Apt 4B' })
  address!: string;

  @ApiProperty({ example: 'New York' })
  city!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Brooklyn' })
  district!: string | null;

  @ApiProperty({ example: 'United States' })
  country!: string;

  @ApiPropertyOptional({ nullable: true, example: 40.7145 })
  latitude!: number | null;

  @ApiPropertyOptional({ nullable: true, example: -73.9613 })
  longitude!: number | null;

  @ApiProperty({ example: false })
  isFeatured!: boolean;

  @ApiProperty({ example: true })
  isPublished!: boolean;

  @ApiProperty({ example: true })
  isApproved!: boolean;

  @ApiProperty({ example: 148 })
  viewCount!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Populated when an admin rejects the listing',
  })
  rejectionReason!: string | null;

  @ApiProperty({ format: 'uuid' })
  agentId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  locationId!: string | null;

  @ApiPropertyOptional({ type: PropertyAgentSummary })
  agent?: PropertyAgentSummary;

  @ApiPropertyOptional({ type: CategoryEntity, nullable: true })
  category?: CategoryEntity | null;

  @ApiPropertyOptional({ type: LocationEntity, nullable: true })
  location?: LocationEntity | null;

  @ApiPropertyOptional({ type: [PropertyImageEntity] })
  images?: PropertyImageEntity[];

  @ApiPropertyOptional({ type: [PropertyFeatureEntity] })
  features?: PropertyFeatureEntity[];

  @ApiPropertyOptional({ example: 12, description: 'How many users saved this listing' })
  favoriteCount?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'Whether the requesting user has favourited this listing. Present only for authenticated callers.',
  })
  isFavorited?: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
