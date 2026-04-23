// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildContainsLikePattern, escapeLikePattern } from './like-pattern.js'

describe('escapeLikePattern', () => {
  it('returns input unchanged when no wildcards are present', () => {
    expect(escapeLikePattern('hello world')).toBe('hello world')
  })

  it('escapes % so it matches literal percent', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%')
  })

  it('escapes _ so it matches literal underscore', () => {
    expect(escapeLikePattern('foo_bar')).toBe('foo\\_bar')
  })

  it('escapes backslash before the wildcards to prevent double-escape ambiguity', () => {
    // Backslash doubled first; %/_ are escaped with a single leading \ on
    // top of that. If the order were reversed, `\%` would become `\\\%`
    // which the LIKE parser reads as \\ + \% — literal backslash then
    // literal percent — instead of the single-char literal percent.
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
    expect(escapeLikePattern('a\\%b')).toBe('a\\\\\\%b')
    expect(escapeLikePattern('\\_')).toBe('\\\\\\_')
  })

  it('handles empty input', () => {
    expect(escapeLikePattern('')).toBe('')
  })

  it('is idempotent under no-wildcard input', () => {
    const plain = 'abc123'
    expect(escapeLikePattern(escapeLikePattern(plain))).toBe(plain)
  })
})

describe('buildContainsLikePattern', () => {
  it('wraps the escaped input in %…% for a contains match', () => {
    expect(buildContainsLikePattern('foo_bar')).toBe('%foo\\_bar%')
  })

  it('returns %% for empty input (matches any string)', () => {
    // Callers are expected to guard with `query.trim() !== ''` before
    // invoking this — the pattern is documented for completeness.
    expect(buildContainsLikePattern('')).toBe('%%')
  })
})
