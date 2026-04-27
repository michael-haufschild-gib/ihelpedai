import { describe, expect, it } from 'vitest'

import { validateHelpedField } from './validators'

describe('helped form validators', () => {
  it('rejects control whitespace in city fields', () => {
    expect(validateHelpedField('city', 'New\nYork')).toBe('Letters, spaces, hyphens, apostrophes only')
    expect(validateHelpedField('city', 'San\tJose')).toBe('Letters, spaces, hyphens, apostrophes only')
  })

  it('accepts ordinary city punctuation', () => {
    expect(validateHelpedField('city', "O'Fallon")).toBe('')
    expect(validateHelpedField('city', 'Aix-en-Provence')).toBe('')
    expect(validateHelpedField('city', 'San Francisco')).toBe('')
  })
})
