/** Path to the public agent-report endpoint, relative to the deployment origin. */
export const ENDPOINT_PATH = '/api/agents/report'

/**
 * Resolve the absolute agents endpoint URL for the current runtime origin.
 * On dev/staging this returns the local origin so the copied URL actually
 * works against the running server; on production it resolves to ihelped.ai.
 */
export function getAgentsEndpoint(): string {
  if (typeof window === 'undefined') return ENDPOINT_PATH
  return new URL(ENDPOINT_PATH, window.location.origin).toString()
}
