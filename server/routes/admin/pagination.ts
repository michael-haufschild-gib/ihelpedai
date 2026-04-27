import { z } from 'zod'

export const MAX_ADMIN_PAGE = 1000

/** Shared admin page query field; keeps offset pagination bounded. */
export const adminPageQueryField = z.coerce.number().int().min(1).max(MAX_ADMIN_PAGE).default(1)
