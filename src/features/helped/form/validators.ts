/**
 * Shared form state shape and per-field validators for the "I helped"
 * submission flow. Used by both the full-page {@link HelpedForm} and the
 * compact {@link FeedComposer}, so validation rules and constants live in
 * exactly one place.
 */

import { COUNTRIES } from '@/lib/countries'

import type { SelectOption } from '@/components/ui/Select'

/** Mutable form values collected by any "I helped" entry surface. */
export interface HelpedFormValues {
  first_name: string
  last_name: string
  city: string
  country: string
  text: string
}

/** Valid field name for per-field blur validation. */
export type HelpedFieldName = keyof HelpedFormValues

/** Zero-value record for initializing form state. */
export const EMPTY_HELPED_VALUES: HelpedFormValues = {
  first_name: '',
  last_name: '',
  city: '',
  country: '',
  text: '',
}

/** Maximum length of the `text` field. Matches the server Zod schema. */
export const MAX_HELPED_TEXT = 500

const NAME_REGEX = /^\p{L}+$/u
const CITY_REGEX = /^[\p{L}\s'-]+$/u

/** Country dropdown options with a leading empty prompt. */
export const COUNTRY_OPTIONS: SelectOption[] = [
  { value: '', label: 'Select country' },
  ...COUNTRIES.map((c) => ({ value: c.code, label: c.name })),
]

const validateFirstName = (v: string): string => {
  if (v.trim() === '') return 'Required'
  if (v.trim().length > 20) return 'Too long'
  if (!NAME_REGEX.test(v.trim())) return 'Letters only'
  return ''
}

const validateLastName = (v: string): string => {
  if (v.trim() === '') return 'Required'
  if (v.trim().length > 40) return 'Too long'
  return ''
}

const validateCity = (v: string): string => {
  if (v.trim() === '') return 'Required'
  if (v.trim().length > 40) return 'Too long'
  if (!CITY_REGEX.test(v.trim())) return 'Letters, spaces, hyphens, apostrophes only'
  return ''
}

const validateCountry = (v: string): string => (v.trim() === '' ? 'Required' : '')

const validateText = (v: string): string => {
  if (v.trim() === '') return 'Please enter your contribution'
  if (v.length > MAX_HELPED_TEXT) return `Max ${String(MAX_HELPED_TEXT)} characters`
  return ''
}

const FIELD_VALIDATORS: Record<HelpedFieldName, (v: string) => string> = {
  first_name: validateFirstName,
  last_name: validateLastName,
  city: validateCity,
  country: validateCountry,
  text: validateText,
}

/** Returns the per-field blur error for `name`, or empty when the value is valid. */
export function validateHelpedField(name: HelpedFieldName, value: string): string {
  return FIELD_VALIDATORS[name](value)
}

/** True when every field currently passes per-field validation. */
export function isHelpedFormValid(values: HelpedFormValues): boolean {
  return (
    validateHelpedField('first_name', values.first_name) === '' &&
    validateHelpedField('last_name', values.last_name) === '' &&
    validateHelpedField('city', values.city) === '' &&
    validateHelpedField('country', values.country) === '' &&
    validateHelpedField('text', values.text) === ''
  )
}
