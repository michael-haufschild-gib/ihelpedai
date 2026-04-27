/** Letters-only personal name field. */
export const NAME_REGEX = /^\p{L}+$/u

/** City field: letters, plain spaces, apostrophes, and hyphens. */
export const CITY_REGEX = /^[\p{L} '-]+$/u

/** ISO-3166 alpha-2 country code. */
export const COUNTRY_ALPHA2_REGEX = /^[A-Z]{2}$/

/** ISO-3166 alpha-2 or alpha-3 country code for agent API compatibility. */
export const COUNTRY_ALPHA2_OR_ALPHA3_REGEX = /^[A-Za-z]{2,3}$/

/** Allow an optional text field to be blank, otherwise require a regex match. */
export function blankOrMatches(value: string, regex: RegExp): boolean {
  return value.trim() === '' || regex.test(value)
}
