/**
 * Utility functions for gradient data ↔ CSS conversion.
 * SVG conversion lives in `@/types/gradient`.
 */

import type { LinearGradientValue } from '@/types/gradient'

/** Converts a LinearGradientValue to a CSS `linear-gradient(...)` string. */
export function toCssGradientString(grad: LinearGradientValue): string {
  const stops = grad.stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${String(s.position)}%`)
    .join(', ')
  return `linear-gradient(${String(grad.angle)}deg, ${stops})`
}

/** Creates a sensible default linear gradient (warm gold to deep orange). */
export function createDefaultGradient(): LinearGradientValue {
  return {
    type: 'linear-gradient',
    angle: 180,
    stops: [
      { color: '#ffb400', position: 0 },
      { color: '#ff6b00', position: 100 },
    ],
  }
}

/** Generates a unique stop ID for React keys (not persisted). */
let stopCounter = 0

/** @returns A unique ID string for use as React key on gradient stops. */
export function nextStopId(): string {
  return `stop-${String(++stopCounter)}`
}
