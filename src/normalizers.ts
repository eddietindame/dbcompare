import type { Normalizer } from './types'

/** SQLite integer 0/1 <-> Postgres boolean */
export const boolean: Normalizer = (s, p) => [!!s, !!p]

/** SQLite number <-> Postgres numeric with fixed decimal places */
export function numeric(decimalPlaces: number): Normalizer {
  return (s, p) => [
    Number(s).toFixed(decimalPlaces),
    Number(p).toFixed(decimalPlaces),
  ]
}

/** SQLite ISO string / unix timestamp <-> Postgres timestamptz */
export const timestamp: Normalizer = (s, p) => {
  const toMs = (v: unknown): number => {
    if (typeof v === 'number') {
      // If it looks like unix seconds (< year 10000 in ms), convert
      return v < 1e12 ? v * 1000 : v
    }
    return new Date(v as string).getTime()
  }
  return [toMs(s), toMs(p)]
}

/** Compare timestamps ignoring sub-second precision */
export const timestampSeconds: Normalizer = (s, p) => {
  const toSec = (v: unknown): number => {
    if (typeof v === 'number') {
      return v < 1e12 ? v : Math.floor(v / 1000)
    }
    return Math.floor(new Date(v as string).getTime() / 1000)
  }
  return [toSec(s), toSec(p)]
}

/** SQLite JSON text <-> Postgres jsonb (parsed by driver) */
export const json: Normalizer = (s, p) => {
  const normalize = (v: unknown): string => {
    if (typeof v === 'string') {
      try {
        return JSON.stringify(JSON.parse(v))
      } catch {
        return v
      }
    }
    return JSON.stringify(v)
  }
  return [normalize(s), normalize(p)]
}

/** Case-insensitive string comparison */
export const caseInsensitive: Normalizer = (s, p) => [
  String(s).toLowerCase(),
  String(p).toLowerCase(),
]

/** Treat null and undefined as equivalent */
export const nullish: Normalizer = (s, p) => [s ?? null, p ?? null]

/** SQLite text "true"/"false" <-> Postgres boolean */
export const textBoolean: Normalizer = (s, p) => {
  const toBool = (v: unknown): boolean => {
    if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1'
    return !!v
  }
  return [toBool(s), toBool(p)]
}

/** Round both sides to a given number of decimal places (for floats) */
export function round(dp: number): Normalizer {
  return (s, p) => [
    Math.round(Number(s) * 10 ** dp) / 10 ** dp,
    Math.round(Number(p) * 10 ** dp) / 10 ** dp,
  ]
}
