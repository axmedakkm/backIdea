import { PaginationMeta } from '../dto/api-response.dto';

/** Marker returned by services so the response interceptor can attach `meta`. */
export class PaginatedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PaginationMeta,
  ) {}
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  };
}

export function paginate<T>(items: T[], total: number, page: number, limit: number) {
  return new PaginatedResult<T>(items, buildPaginationMeta(total, page, limit));
}
