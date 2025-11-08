const TASHKENT_TIMEZONE = 'Asia/Tashkent'
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

function ensureDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' && DATE_ONLY_REGEX.test(value.trim())) {
    return new Date(`${value.trim()}T00:00:00+05:00`)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatParts(value) {
  const date = ensureDate(value)
  if (!date) return null
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TASHKENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [year, month, day] = formatter.format(date).split('-')
  return { year, month, day }
}

export function formatTashkentDate(value, { fallback = '-' } = {}) {
  const date = ensureDate(value)
  if (!date) return fallback
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: TASHKENT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    const parts = formatParts(value)
    return parts ? `${parts.year}-${parts.month}-${parts.day}` : fallback
  }
}

export function formatTashkentDateTime(value, { withSeconds = false, fallback = '-' } = {}) {
  const date = ensureDate(value)
  if (!date) return fallback
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: TASHKENT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
    }).format(date)
  } catch {
    return fallback
  }
}

export function formatTashkentDateISO(value = new Date()) {
  const parts = formatParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

export const getTashkentTodayISO = (value) => formatTashkentDateISO(value || new Date())

export function parseTashkentDate(value) {
  return ensureDate(value)
}

export function startOfTashkentDay(value = new Date()) {
  const iso = getTashkentTodayISO(value)
  return iso ? new Date(`${iso}T00:00:00+05:00`) : null
}

export { TASHKENT_TIMEZONE }
