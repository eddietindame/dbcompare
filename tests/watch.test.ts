import { describe, it, expect } from 'bun:test'
import { shouldNotify } from '../src/watch'

describe('shouldNotify', () => {
  it('notifies on first run when diffs are found', () => {
    expect(shouldNotify(3, -1)).toBe(true)
  })

  it('does not notify on first run when no diffs', () => {
    expect(shouldNotify(0, -1)).toBe(false)
  })

  it('does not notify when diff count stays the same', () => {
    expect(shouldNotify(3, 3)).toBe(false)
  })

  it('notifies when diff count increases', () => {
    expect(shouldNotify(5, 3)).toBe(true)
  })

  it('notifies when diff count decreases but is still non-zero', () => {
    expect(shouldNotify(2, 5)).toBe(true)
  })

  it('does not notify when diffs resolve to zero', () => {
    expect(shouldNotify(0, 3)).toBe(false)
  })

  it('notifies when diffs reappear after being zero', () => {
    expect(shouldNotify(1, 0)).toBe(true)
  })

  it('does not notify when staying at zero', () => {
    expect(shouldNotify(0, 0)).toBe(false)
  })
})
