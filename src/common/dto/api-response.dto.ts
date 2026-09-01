import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Pagination envelope returned alongside list responses. */
export class PaginationMeta {
  @ApiProperty({ example: 1, description: 'Current page number (1-indexed)' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Number of items requested per page' })
  limit!: number;

  @ApiProperty({ example: 100, description: 'Total number of matching records' })
  total!: number;

  @ApiProperty({ example: 5, description: 'Total number of pages available' })
  totalPages!: number;

  @ApiProperty({ example: true, description: 'Whether a following page exists' })
  hasNextPage!: boolean;

  @ApiProperty({ example: false, description: 'Whether a preceding page exists' })
  hasPreviousPage!: boolean;
}

/** Standard success envelope. `data` shape varies per endpoint. */
export class ApiSuccessResponse<T = unknown> {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Operation completed successfully' })
  message!: string;

  @ApiProperty({ description: 'Endpoint-specific payload' })
  data!: T;

  @ApiPropertyOptional({ type: PaginationMeta })
  meta?: PaginationMeta;
}

/** Standard error envelope produced by the global exception filter. */
export class ApiErrorResponse {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['email must be an email'],
    description: 'Field-level validation messages, present on 400/422 responses',
  })
  details?: string[];

  @ApiProperty({ example: '/api/v1/properties' })
  path!: string;

  @ApiProperty({ example: '2026-08-29T10:15:00.000Z' })
  timestamp!: string;
}
