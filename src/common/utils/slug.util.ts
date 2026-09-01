import { randomBytes } from 'crypto';

// Combining diacritical marks, stripped after NFD normalization.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Converts arbitrary text into a URL-safe slug.
 * Diacritics are stripped so "Piso Centrico" keeps its accents out of the URL.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Appends a short random suffix, used to resolve slug collisions. */
export function slugifyWithSuffix(input: string): string {
  const base = slugify(input) || 'item';
  return `${base}-${randomBytes(3).toString('hex')}`;
}
