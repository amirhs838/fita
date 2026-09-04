/** Day-key helpers — the app stores days as user-local ISO "YYYY-MM-DD" strings. */

const pad = (n: number) => String(n).padStart(2, '0')

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isValidDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/** Full Persian date with Latin digits, e.g. «جمعه 6 شهریور». */
export function faDate(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now)
  } catch {
    return ''
  }
}
