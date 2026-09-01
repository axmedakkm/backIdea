import { slugify, slugifyWithSuffix } from './slug.util';

describe('slug utilities', () => {
  describe('slugify', () => {
    it('lowercases and hyphenates a title', () => {
      expect(slugify('Sunlit Two-Bedroom in Williamsburg')).toBe(
        'sunlit-two-bedroom-in-williamsburg',
      );
    });

    it('strips diacritics rather than dropping the letters', () => {
      expect(slugify('Piso Céntrico en Barcelona')).toBe('piso-centrico-en-barcelona');
    });

    it('removes punctuation and collapses whitespace', () => {
      expect(slugify('Loft  &  Studio!! (Marina)')).toBe('loft-studio-marina');
    });

    it('trims leading and trailing separators', () => {
      expect(slugify('  --Penthouse--  ')).toBe('penthouse');
    });

    it('returns an empty string when nothing slugifiable remains', () => {
      expect(slugify('!!! ??? ***')).toBe('');
    });

    it('caps the slug length at 80 characters', () => {
      expect(slugify('a'.repeat(200)).length).toBe(80);
    });
  });

  describe('slugifyWithSuffix', () => {
    it('appends a random suffix so repeated titles do not collide', () => {
      const first = slugifyWithSuffix('Modern Villa');
      const second = slugifyWithSuffix('Modern Villa');

      expect(first).toMatch(/^modern-villa-[0-9a-f]{6}$/);
      expect(second).toMatch(/^modern-villa-[0-9a-f]{6}$/);
      expect(first).not.toBe(second);
    });

    it('falls back to "item" when the input slugifies to nothing', () => {
      expect(slugifyWithSuffix('###')).toMatch(/^item-[0-9a-f]{6}$/);
    });
  });
});
