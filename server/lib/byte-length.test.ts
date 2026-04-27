import { describe, expect, it } from 'vitest'

import { byteLength } from './byte-length.js'

describe('byteLength', () => {
  it('returns 0 for an empty string', () => {
    expect(byteLength('')).toBe(0)
  })

  it('counts ASCII as one byte per character', () => {
    expect(byteLength('hello')).toBe(5)
    expect(byteLength('a'.repeat(72))).toBe(72)
  })

  it('counts multi-byte unicode at its UTF-8 width, not the JS string length', () => {
    // A precomposed `é` is 2 bytes in UTF-8 but 1 JS code unit.
    expect('é'.length).toBe(1)
    expect(byteLength('é')).toBe(2)
    // A 4-byte emoji is 2 JS code units (surrogate pair) but 4 UTF-8 bytes.
    expect('😀'.length).toBe(2)
    expect(byteLength('😀')).toBe(4)
  })

  it('detects when an ASCII 50-char password is well under bcrypt 72-byte limit', () => {
    expect(byteLength('a'.repeat(50))).toBe(50)
  })

  it('detects when a 36-char emoji password exceeds bcrypt 72-byte limit (4 bytes/char)', () => {
    // 18 four-byte glyphs = 72 bytes exactly; 19 push it over.
    expect(byteLength('😀'.repeat(18))).toBe(72)
    expect(byteLength('😀'.repeat(19))).toBe(76)
  })
})
