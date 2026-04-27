import type { ZodError } from 'zod'

/** Convert Zod fieldErrors arrays into the public `{ field: message }` map. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [key, messages] of Object.entries(error.flatten().fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      const first = messages[0]
      if (typeof first === 'string') fields[key] = first
    }
  }
  return fields
}
