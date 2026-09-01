import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewAuthorSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sofia Almeida' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  avatar!: string | null;
}

export class ReviewEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  agentId!: string;

  @ApiProperty({ format: 'uuid' })
  authorId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  rating!: number;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ type: ReviewAuthorSummary })
  author?: ReviewAuthorSummary;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class AgentRatingSummary {
  @ApiProperty({ example: 4.7, description: 'Average rating across all reviews' })
  rating!: number;

  @ApiProperty({ example: 23 })
  reviewCount!: number;

  @ApiProperty({
    description: 'How many reviews gave each star rating',
    example: { '1': 0, '2': 1, '3': 2, '4': 6, '5': 14 },
    additionalProperties: { type: 'number' },
  })
  distribution!: Record<string, number>;
}
