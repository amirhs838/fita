const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Convert Persian/Arabic-Indic digits to Latin digits. */
export function toEnglishDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const fa = FA_DIGITS.indexOf(ch)
    if (fa >= 0) return String(fa)
    return String(AR_DIGITS.indexOf(ch))
  })
}

/**
 * The app's display formatter — the UI shows Latin digits everywhere.
 * Pass any number or string; Persian/Arabic-Indic digits (e.g. from stored
 * Persian labels) are normalized to Latin, Latin stays as-is.
 */
export function enDigits(input: string | number): string {
  return toEnglishDigits(String(input))
}

/**
 * Normalize Iranian mobile numbers to the canonical form `989XXXXXXXXX`.
 * Accepts: 09123456789 · +989123456789 · 00989123456789 · 9123456789 · Persian digits.
 * Returns null when the input cannot be a valid Iranian mobile number.
 */
export function normalizePhone(raw: string): string | null {
  let s = toEnglishDigits(raw).replace(/[\s\-()+.]/g, '')
  if (s.startsWith('00989')) s = s.slice(2)
  else if (s.startsWith('989')) s = s
  else if (s.startsWith('09')) s = `98${s.slice(1)}`
  else if (s.startsWith('9') && s.length === 10) s = `98${s}`
  if (!/^989\d{9}$/.test(s)) return null
  return s
}

/** Canonical `989123456789` → `0912 345 6789` (display form). */
export function formatPhone(canonical: string): string {
  const n = `0${canonical.slice(2)}`
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`
}
