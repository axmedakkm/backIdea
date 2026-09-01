import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Luxury Homes' })
  name!: string;

  @ApiProperty({ example: 'luxury-homes', description: 'URL-safe identifier derived from the name' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true, example: 'High-end residential properties' })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'building-2' })
  icon!: string | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    example: 24,
    description: 'Number of published properties in this category',
  })
  propertyCount?: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
