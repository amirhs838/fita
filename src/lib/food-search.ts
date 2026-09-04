/**
 * Shared Persian text normalization for food search.
 * Used by the seed script (building searchText) and the search API (normalizing queries)
 * so that Arabic variants (ي/ك), spacing and case all match consistently.
 */
export function normalizeFaSearch(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ىىۍ]/g, 'ی')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/ۀ|ة/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[\u200c\u064b-\u065f\u0670]/g, '') // ZWNJ + diacritics
    .replace(/\s+/g, ' ')
}
