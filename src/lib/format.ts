import { COUNTRIES } from '@/lib/countries'

const LABEL_BY_CODE: ReadonlyMap<string, string> = new Map(
  COUNTRIES.map((c) => [c.code, c.name]),
)

/** Resolve an ISO 3166-1 alpha-2 code to its human-readable country name. */
export const countryLabel = (code: string): string => LABEL_BY_CODE.get(code) ?? code

/** Format an ISO-8601 date-time string as YYYY-MM-DD in the UTC calendar. */
export const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toISOString().slice(0, 10)
}
