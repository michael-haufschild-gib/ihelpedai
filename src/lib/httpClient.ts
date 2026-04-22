/**
 * Shared HTTP client used by both the public API wrapper (`api.ts`) and the
 * admin API wrapper (`adminApi.ts`). Both wrappers used to ship near-identical
 * fetch + envelope-decode helpers; this module is the deduplicated kernel.
 *
 * Behaviour:
 *   - Sends/receives JSON (caller may override headers).
 *   - On 2xx, returns the decoded JSON body cast to `T`.
 *   - On non-2xx, throws {@link ApiError} built from the standard server
 *     error envelope (`{ error, fields, retry_after_seconds, message }`).
 *   - On network failure, throws an `ApiError` with `kind: 'internal_error'`
 *     and `status: 0`.
 *   - Non-JSON error bodies (e.g. nginx 502 HTML) decode to `null`; the
 *     thrown ApiError still carries the HTTP status so callers can branch.
 */

/** Recognized server error kinds. Mirrors PRD-level error envelope. */
export type ApiErrorKind =
  | 'invalid_input'
  | 'rate_limited'
  | 'unauthorized'
  | 'internal_error'

/** Per-field validation messages returned on `invalid_input`. */
export type ApiFieldErrors = Record<string, string>

/** Thrown by every wrapper on non-success or network failure. */
export class ApiError extends Error {
  public readonly kind: ApiErrorKind
  public readonly status: number
  public readonly fields?: ApiFieldErrors
  public readonly retryAfterSeconds?: number

  /** Construct a typed API error from a parsed server response. */
  public constructor(opts: {
    kind: ApiErrorKind
    status: number
    message?: string
    fields?: ApiFieldErrors
    retryAfterSeconds?: number
  }) {
    super(opts.message ?? opts.kind)
    this.name = 'ApiError'
    this.kind = opts.kind
    this.status = opts.status
    this.fields = opts.fields
    this.retryAfterSeconds = opts.retryAfterSeconds
  }
}

/** Pagination envelope used by every list endpoint, public and admin. */
export interface Paginated<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

/** Raw server error envelope before normalisation. */
interface ErrorEnvelope {
  error?: unknown
  fields?: unknown
  retry_after_seconds?: unknown
  message?: unknown
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null

const asErrorKind = (value: unknown): ApiErrorKind => {
  if (
    value === 'invalid_input' ||
    value === 'rate_limited' ||
    value === 'unauthorized' ||
    value === 'internal_error'
  ) {
    return value
  }
  return 'internal_error'
}

const asFields = (value: unknown): ApiFieldErrors | undefined => {
  if (!isRecord(value)) return undefined
  const out: ApiFieldErrors = {}
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** Build a typed ApiError from any HTTP error response body. Public for tests. */
export function buildApiErrorFromBody(status: number, body: unknown): ApiError {
  const envelope: ErrorEnvelope = isRecord(body) ? body : {}
  return new ApiError({
    kind: asErrorKind(envelope.error),
    status,
    message: typeof envelope.message === 'string' ? envelope.message : undefined,
    fields: asFields(envelope.fields),
    retryAfterSeconds: asNumber(envelope.retry_after_seconds),
  })
}

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Options for {@link request}. Extends RequestInit with credentials default. */
export interface RequestOptions extends Omit<RequestInit, 'credentials'> {
  /** Same semantics as the standard fetch credentials option. */
  credentials?: RequestCredentials
}

/**
 * Execute a request and decode its JSON body. Throws {@link ApiError} on
 * non-2xx responses or on network failure.
 */
export async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (cause) {
    throw new ApiError({
      kind: 'internal_error',
      status: 0,
      message: cause instanceof Error ? cause.message : 'network_error',
    })
  }

  const text = await response.text()
  const body: unknown = text.length > 0 ? safeParseJson(text) : null

  if (!response.ok) {
    throw buildApiErrorFromBody(response.status, body)
  }
  return body as T
}

/** Helper: build a JSON body request init (POST by default). */
export function jsonBody(payload: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): RequestOptions {
  return { method, body: JSON.stringify(payload) }
}

/** Allowable value types in a query-string params record. */
export type QueryParamValue = string | number | boolean | null | undefined

/**
 * Compile-time shape constraint for {@link buildQuery}: every value must be a
 * `QueryParamValue`. Wrapping in a mapped type lets typed filter interfaces
 * (e.g. `EntryFilters`) satisfy the call without needing an index signature
 * — the only requirement is that *every property they declare* is in the
 * accepted union.
 */
export type QueryParams<T> = { [K in keyof T]: QueryParamValue }

/**
 * Build a `?key=value&key2=value2` query string from a params record. Skips
 * undefined and null values explicitly — passing `null` would previously have
 * coerced to the literal string `"null"`, a subtle correctness bug if a
 * caller ever cleared a filter to null instead of undefined. Booleans
 * stringify to `"true"` / `"false"`.
 *
 * Each value is also type-checked at runtime before being stringified so any
 * caller-side widening cannot smuggle an object/array into the URL.
 */
export function buildQuery<T extends QueryParams<T>>(params: T): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      qs.set(k, String(v))
    }
  }
  const s = qs.toString()
  return s.length > 0 ? `?${s}` : ''
}
