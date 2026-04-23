/**
 * Zod schemas describing the wire shape of every public + admin endpoint
 * response. Imported by server contract tests in
 * `server/__tests__/api-contract.spec.ts` and by client wrappers when they
 * want defensive parsing. The TypeScript types in {@link ./api} and
 * {@link ./adminApi} must structurally match these schemas — the contract
 * spec verifies that claim against the running server.
 *
 * Adding a new endpoint:
 *   1. Add a Zod schema below.
 *   2. Add an integration case to api-contract.spec.ts.
 *   3. Mirror the response shape in api.ts / adminApi.ts as a `type`.
 *
 * The schemas intentionally use `.passthrough()` everywhere so accidental
 * server-side additions don't immediately fail the contract — additions are
 * non-breaking. *Removals* and *renames* of declared fields are the breaking
 * changes the spec catches.
 */

import { z } from 'zod'

/** Pagination envelope used by every list endpoint. */
export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z
    .object({
      items: z.array(item),
      page: z.number().int().nonnegative(),
      page_size: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .passthrough()

export const helpedPostSchema = z
  .object({
    slug: z.string().min(1),
    first_name: z.string(),
    city: z.string(),
    country: z.string(),
    text: z.string(),
    like_count: z.number().int().nonnegative(),
    created_at: z.string(),
  })
  .passthrough()

export const helpedPostCreatedSchema = z
  .object({
    slug: z.string().min(1),
    public_url: z.string().url(),
    status: z.literal('posted'),
  })
  .passthrough()

export const reportSchema = z
  .object({
    slug: z.string().min(1),
    reported_first_name: z.string(),
    reported_city: z.string(),
    reported_country: z.string(),
    text: z.string(),
    action_date: z.string(),
    created_at: z.string(),
    dislike_count: z.number().int().nonnegative(),
    submitted_via_api: z.boolean(),
    reporter: z
      .object({
        first_name: z.string(),
        city: z.string(),
        country: z.string(),
      })
      .optional(),
    self_reported_model: z.string().optional(),
    severity: z.number().int().min(0).max(10).optional(),
  })
  .passthrough()

export const reportCreatedSchema = z
  .object({
    slug: z.string().min(1),
    public_url: z.string().url(),
    status: z.literal('posted'),
  })
  .passthrough()

/**
 * Agent-submitted report response. Differs from {@link reportCreatedSchema}
 * in two ways: the server returns `entry_id` (not `slug`) and `status` is
 * `'posted' | 'pending'` — the admin `auto_publish_agents` setting decides
 * which. Default off → pending.
 */
export const agentReportCreatedSchema = z
  .object({
    entry_id: z.string().min(1),
    public_url: z.string().url(),
    status: z.union([z.literal('posted'), z.literal('pending')]),
  })
  .passthrough()

export const healthSchema = z
  .object({
    ok: z.boolean(),
    version: z.string(),
  })
  .passthrough()

export const apiErrorEnvelopeSchema = z
  .object({
    error: z.union([
      z.literal('invalid_input'),
      z.literal('rate_limited'),
      z.literal('unauthorized'),
      z.literal('internal_error'),
      z.literal('not_found'),
      z.string(),
    ]),
    fields: z.record(z.string(), z.string()).optional(),
    retry_after_seconds: z.number().optional(),
    message: z.string().optional(),
  })
  .passthrough()

/**
 * Convenience for tests: parse a server response body against a schema and
 * throw a readable error including the schema name on failure. Replaces the
 * default Zod error message which doesn't say which endpoint produced it.
 */
export function parseResponse<T>(name: string, schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new Error(
      `Contract violation: ${name} response failed schema:\n${JSON.stringify(result.error.flatten(), null, 2)}`,
    )
  }
  return result.data
}
