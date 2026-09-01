import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedResult, buildPaginationMeta, paginate } from './pagination.util';

describe('pagination utilities', () => {
  describe('buildPaginationMeta', () => {
    it('computes total pages and navigation flags for a middle page', () => {
      const meta = buildPaginationMeta(100, 3, 20);

      expect(meta).toEqual({
        page: 3,
        limit: 20,
        total: 100,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('marks the first page as having no previous page', () => {
      const meta = buildPaginationMeta(100, 1, 20);

      expect(meta.hasPreviousPage).toBe(false);
      expect(meta.hasNextPage).toBe(true);
    });

    it('marks the last page as having no next page', () => {
      const meta = buildPaginationMeta(100, 5, 20);

      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(true);
    });

    it('rounds a partial final page up', () => {
      expect(buildPaginationMeta(101, 1, 20).totalPages).toBe(6);
    });

    it('reports no pages and no navigation for an empty result set', () => {
      const meta = buildPaginationMeta(0, 1, 20);

      expect(meta.totalPages).toBe(0);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });
  });

  describe('paginate', () => {
    it('returns a PaginatedResult carrying items and meta', () => {
      const result = paginate(['a', 'b'], 2, 1, 20);

      expect(result).toBeInstanceOf(PaginatedResult);
      expect(result.items).toEqual(['a', 'b']);
      expect(result.meta.total).toBe(2);
    });
  });

  describe('PaginationQueryDto.skip', () => {
    it.each([
      [1, 20, 0],
      [2, 20, 20],
      [3, 15, 30],
      [5, 10, 40],
    ])('page %i with limit %i skips %i records', (page, limit, expected) => {
      const query = new PaginationQueryDto();
      query.page = page;
      query.limit = limit;

      expect(query.skip).toBe(expected);
    });

    it('is lost when the DTO is spread, which is why services take overrides as arguments', () => {
      const query = new PaginationQueryDto();
      query.page = 3;
      query.limit = 20;

      const spread = { ...query };

      // Guards the fix for a real bug: `{ ...query, agentId }` silently
      // dropped the getter and disabled pagination.
      expect(query.skip).toBe(40);
      expect((spread as Partial<PaginationQueryDto>).skip).toBeUndefined();
    });
  });
});
