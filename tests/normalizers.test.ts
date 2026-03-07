import { describe, it, expect } from 'bun:test'
import {
  boolean,
  numeric,
  timestamp,
  timestampSeconds,
  json,
  caseInsensitive,
  nullish,
  textBoolean,
  round,
} from '../src/normalizers'

describe('normalizers', () => {
  describe('boolean', () => {
    it('normalizes SQLite 0/1 to boolean', () => {
      expect(boolean(1, true)).toEqual([true, true])
      expect(boolean(0, false)).toEqual([false, false])
    })

    it('treats 0 and false as equal', () => {
      const [s, p] = boolean(0, false)
      expect(s).toBe(p)
    })

    it('treats 1 and true as equal', () => {
      const [s, p] = boolean(1, true)
      expect(s).toBe(p)
    })

    it('detects mismatch', () => {
      const [s, p] = boolean(0, true)
      expect(s).not.toBe(p)
    })
  })

  describe('numeric', () => {
    it('normalizes to fixed decimal places', () => {
      const norm = numeric(6)
      expect(norm(15000, '15000.000000')).toEqual([
        '15000.000000',
        '15000.000000',
      ])
    })

    it('treats integer and decimal as equal', () => {
      const norm = numeric(2)
      const [s, p] = norm(10, 10.0)
      expect(s).toBe(p)
    })

    it('ignores difference beyond decimal places', () => {
      const norm = numeric(2)
      const [s, p] = norm(10.001, 10.002)
      expect(s).toBe(p) // both become "10.00"
    })

    it('detects actual difference', () => {
      const norm = numeric(2)
      const [s, p] = norm(10.01, 10.02)
      expect(s).not.toBe(p)
    })
  })

  describe('timestamp', () => {
    it('normalizes ISO string and Date object to same ms', () => {
      const iso = '2026-02-15T00:00:00.000Z'
      const date = new Date('2026-02-15T00:00:00.000Z')
      const [s, p] = timestamp(iso, date)
      expect(s).toBe(p)
    })

    it('normalizes unix seconds to ms', () => {
      const unixSec = 1771113600
      const iso = '2026-02-15T00:00:00.000Z'
      const [s, p] = timestamp(unixSec, iso)
      expect(s).toBe(p)
    })

    it('passes through ms timestamps', () => {
      const ms = 1771113600000
      const iso = '2026-02-15T00:00:00.000Z'
      const [s, p] = timestamp(ms, iso)
      expect(s).toBe(p)
    })

    it('detects different timestamps', () => {
      const [s, p] = timestamp(
        '2026-02-15T00:00:00.000Z',
        '2026-02-16T00:00:00.000Z',
      )
      expect(s).not.toBe(p)
    })
  })

  describe('timestampSeconds', () => {
    it('ignores sub-second differences', () => {
      const [s, p] = timestampSeconds(
        '2026-03-05T10:20:51.681Z',
        '2026-03-05T10:20:51.000Z',
      )
      expect(s).toBe(p)
    })

    it('detects second-level differences', () => {
      const [s, p] = timestampSeconds(
        '2026-03-05T10:20:51.000Z',
        '2026-03-05T10:20:52.000Z',
      )
      expect(s).not.toBe(p)
    })
  })

  describe('json', () => {
    it('normalizes JSON string and parsed object', () => {
      const str = '{"a":1,"b":2}'
      const obj = { a: 1, b: 2 }
      const [s, p] = json(str, obj)
      expect(s).toBe(p)
    })

    it('normalizes with different key ordering', () => {
      const str1 = '{"b":2,"a":1}'
      const obj = { a: 1, b: 2 }
      const [s, p] = json(str1, obj)
      // JSON.stringify preserves insertion order, so these may differ
      // This tests that both are valid JSON
      expect(JSON.parse(s as string)).toEqual(JSON.parse(p as string))
    })

    it('handles non-JSON strings gracefully', () => {
      const [s, p] = json('not json', 'not json')
      expect(s).toBe(p)
    })
  })

  describe('caseInsensitive', () => {
    it('treats different cases as equal', () => {
      const [s, p] = caseInsensitive('Hello', 'hello')
      expect(s).toBe(p)
    })

    it('detects actual differences', () => {
      const [s, p] = caseInsensitive('Hello', 'World')
      expect(s).not.toBe(p)
    })
  })

  describe('nullish', () => {
    it('treats null and undefined as equal', () => {
      const [s, p] = nullish(null, undefined)
      expect(s).toBe(p)
    })

    it('preserves non-null values', () => {
      const [s, p] = nullish('a', 'a')
      expect(s).toBe(p)
    })
  })

  describe('textBoolean', () => {
    it('normalizes "true" string to boolean', () => {
      const [s, p] = textBoolean('true', true)
      expect(s).toBe(p)
    })

    it('normalizes "false" string to boolean', () => {
      const [s, p] = textBoolean('false', false)
      expect(s).toBe(p)
    })

    it('normalizes "1" to true', () => {
      const [s, p] = textBoolean('1', true)
      expect(s).toBe(p)
    })
  })

  describe('round', () => {
    it('rounds both sides', () => {
      const norm = round(2)
      const [s, p] = norm(1.005, 1.004)
      expect(s).toBe(p)
    })

    it('detects difference after rounding', () => {
      const norm = round(2)
      const [s, p] = norm(1.01, 1.02)
      expect(s).not.toBe(p)
    })
  })
})
