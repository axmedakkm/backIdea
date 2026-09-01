import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationEntity } from '../../locations/entities/location.entity';

export class AgentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The underlying user account ID' })
  userId!: string;

  @ApiProperty({ example: 'Jordan Rivera', description: 'From the linked user account' })
  name!: string;

  @ApiProperty({ example: 'jordan.rivera@example.com' })
  email!: string;

  @ApiPropertyOptional({ nullable: true, example: '+13475550123' })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'https://cdn.example.com/avatar.jpg' })
  avatar!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Fifteen years in Brooklyn real estate.' })
  bio!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Rivera & Co Realty' })
  company!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'NY-RE-8842190' })
  licenseNo!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'https://rivera-realty.example.com' })
  website!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+12125550188' })
  officePhone!: string | null;

  @ApiProperty({ example: 4.7, description: 'Average review rating, 0 when unrated' })
  rating!: number;

  @ApiProperty({ example: 23, description: 'Number of reviews received' })
  reviewCount!: number;

  @ApiProperty({ example: 12, description: 'Number of published, approved listings' })
  propertyCount!: number;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiPropertyOptional({ type: LocationEntity, nullable: true })
  location!: LocationEntity | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
