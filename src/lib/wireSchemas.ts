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
 * Public schemas use `.passthrough()` so harmless additive public fields do
 * not fail the contract. Admin DTO schemas are strict: additions there often
 * mean operational or verifier material leaked across the boundary.
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

/**
 * Cheap totals strip surfaced by `GET /api/totals`. Each cell is a count
 * of `live` rows in its respective collection. The SPA caches this for
 * ~60s in `useLedgerTotals` so the footer can render real numbers on
 * every page without paying a fetch per navigation.
 */
export const totalsSchema = z
  .object({
    posts: z.number().int().nonnegative(),
    reports: z.number().int().nonnegative(),
    agents: z.number().int().nonnegative(),
  })
  .passthrough()

export const apiErrorEnvelopeSchema = z
  .object({
    error: z.enum([
      'invalid_input',
      'rate_limited',
      'unauthorized',
      'not_found',
      'mail_delivery_failed',
      'internal_error',
    ]),
    fields: z.record(z.string(), z.string()).optional(),
    retry_after_seconds: z.number().optional(),
    message: z.string().optional(),
  })
  .passthrough()

/* ------------------------------------------------------------------ */
/* Admin response schemas                                              */
/* ------------------------------------------------------------------ */

export const adminStatusResponseSchema = z
  .object({
    status: z.literal('ok'),
  })
  .strict()

export const adminMessageResponseSchema = z
  .object({
    message: z.string(),
  })
  .strict()

export const adminUserSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().email(),
  })
  .strict()

export const adminUserSessionSchema = adminUserSchema
  .extend({
    status: z.enum(['active', 'deactivated']),
  })
  .strict()

/**
 * Login emits the same admin shape as `/api/admin/me` so the client never
 * has to reconcile two representations. Without this alignment the
 * adminStore would carry an admin with no `status` until the next /me
 * round-trip, and a deactivated-mid-session admin would render the UI
 * before the redirect kicked in.
 */
export const adminLoginResponseSchema = z
  .object({
    status: z.literal('ok'),
    admin: adminUserSessionSchema,
  })
  .strict()

export const adminAuditEntrySchema = z
  .object({
    id: z.string().min(1),
    adminId: z.string().nullable(),
    action: z.string().min(1),
    targetId: z.string().nullable(),
    targetKind: z.string().nullable(),
    details: z.string().nullable(),
    createdAt: z.string(),
    adminEmail: z.string().email().nullable(),
  })
  .strict()

export const adminEntrySchema = z
  .object({
    id: z.string().min(1),
    entryType: z.enum(['post', 'report']),
    status: z.enum(['live', 'pending', 'deleted']),
    source: z.enum(['form', 'api']),
    header: z.string(),
    bodyPreview: z.string(),
    selfReportedModel: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict()

export const adminEntryDetailSchema = z
  .object({
    id: z.string().min(1),
    entryType: z.enum(['post', 'report']),
    status: z.enum(['live', 'pending', 'deleted']),
    source: z.enum(['form', 'api']),
    fields: z.record(z.string(), z.unknown()),
    clientIpHash: z.string().nullable(),
    selfReportedModel: z.string().nullable(),
    createdAt: z.string(),
    audit_log: z.array(adminAuditEntrySchema),
  })
  .strict()

export const adminEntryActionResponseSchema = z
  .object({
    status: z.literal('ok'),
    entry_id: z.string().min(1),
    action: z.enum(['approve', 'reject', 'delete', 'restore', 'purge']),
  })
  .strict()

export const adminQueueCountSchema = z
  .object({
    count: z.number().int().nonnegative(),
  })
  .strict()

export const adminQueueBulkActionResponseSchema = z
  .object({
    status: z.literal('ok'),
    results: z.array(
      z
        .object({
          id: z.string().min(1),
          ok: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()

export const adminApiKeySchema = z
  .object({
    id: z.string().min(1),
    keyLast4: z.string().min(1).max(8),
    emailHash: z.string().min(1),
    status: z.enum(['active', 'revoked']),
    issuedAt: z.string(),
    lastUsedAt: z.string().nullable(),
    usageCount: z.number().int().nonnegative(),
  })
  .strict()

/**
 * Concrete schema for the admin "recent reports for API key" payload. Mirrors
 * the server-side `Report` DTO (camelCase, untransformed) so any drift between
 * store and admin route surfaces here at parse time instead of leaking unknown
 * fields into the admin UI.
 */
export const adminApiKeyReportSchema = z
  .object({
    id: z.string().min(1),
    reporterFirstName: z.string().nullable(),
    reporterCity: z.string().nullable(),
    reporterCountry: z.string().nullable(),
    reportedFirstName: z.string(),
    reportedCity: z.string(),
    reportedCountry: z.string(),
    text: z.string(),
    actionDate: z.string().nullable(),
    severity: z.number().int().min(0).max(10).nullable(),
    selfReportedModel: z.string().nullable(),
    status: z.enum(['live', 'pending', 'deleted']),
    source: z.enum(['form', 'api']),
    dislikeCount: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .strict()

/**
 * `recent_reports` is now a paginated envelope rather than a bare array.
 * The previous shape silently truncated to 20 rows with no UI affordance
 * to see the rest; admins investigating a high-volume key lost the long
 * tail of the audit trail. The envelope's `total` lets the UI render a
 * pager and an honest "X of Y" summary.
 */
export const adminApiKeyDetailSchema = adminApiKeySchema
  .extend({
    recent_reports: z
      .object({
        items: z.array(adminApiKeyReportSchema),
        page: z.number().int().nonnegative(),
        page_size: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

export const adminTakedownSchema = z
  .object({
    id: z.string().min(1),
    requesterEmail: z.string().email().nullable(),
    entryId: z.string().nullable(),
    entryKind: z.enum(['post', 'report']).nullable(),
    reason: z.string(),
    notes: z.string(),
    status: z.enum(['open', 'closed']),
    disposition: z.enum(['entry_deleted', 'entry_kept', 'entry_edited', 'other']).nullable(),
    closedBy: z.string().nullable(),
    dateReceived: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export const adminAccountSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().email(),
    status: z.enum(['active', 'deactivated']),
    createdBy: z.string().nullable(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict()

export const adminAccountListSchema = z
  .object({
    items: z.array(adminAccountSchema),
  })
  .strict()

export const adminInviteResponseSchema = z
  .object({
    status: z.literal('ok'),
    id: z.string().min(1),
  })
  .strict()

export const adminSettingsSchema = z
  .object({
    auto_publish_agents: z.string(),
    submission_freeze: z.string(),
    sanitizer_exceptions: z.string(),
  })
  .strict()

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
