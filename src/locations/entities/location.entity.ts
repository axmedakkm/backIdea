import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LocationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'United States' })
  country!: string;

  @ApiProperty({ example: 'New York' })
  city!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Brooklyn' })
  district!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '450 Bedford Avenue' })
  address!: string | null;

  @ApiProperty({ example: 'united-states-new-york-brooklyn' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true, example: 40.7128 })
  latitude!: number | null;

  @ApiPropertyOptional({ nullable: true, example: -74.006 })
  longitude!: number | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: 12, description: 'Published properties at this location' })
  propertyCount?: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
