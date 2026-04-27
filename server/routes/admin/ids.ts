import { z } from 'zod'

export const MAX_ADMIN_ROUTE_ID_LENGTH = 64

export const adminRouteIdField = z.string().min(1).max(MAX_ADMIN_ROUTE_ID_LENGTH)

export const idParamsSchema = z.object({ id: adminRouteIdField })
