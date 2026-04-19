/**
 * Color interpolation helpers for gradient editing.
 * Separated from gradientUtils to keep CSS conversion independent of interpolation logic.
 */

import type { GradientStop } from '@/types/gradient'

const HEX_6 = /^#?([0-9a-fA-F]{6})$/
const HEX_3 = /^#?([0-9a-fA-F]{3})$/

/** Normalizes #RGB / RRGGBB / #RRGGBB into canonical "#RRGGBB"; returns null on unsupported formats. */
export function normalizeHex6(hex: string): string | null {
  const m6 = HEX_6.exec(hex)
  if (m6) return `#${m6[1]!.toLowerCase()}`
  const m3 = HEX_3.exec(hex)
  if (m3) {
    const [r, g, b] = m3[1]!.split('')
    return `#${r!}${r!}${g!}${g!}${b!}${b!}`.toLowerCase()
  }
  return null
}

function parseHexChannel(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), 16)
}

/** Linearly interpolates between two colors. Falls back to `hex1` if either input is not a valid 3/6-digit hex. */
export function lerpHex(hex1: string, hex2: string, t: number): string {
  const a = normalizeHex6(hex1)
  const b = normalizeHex6(hex2)
  if (a === null || b === null) return a ?? hex1
  const r1 = parseHexChannel(a, 1)
  const g1 = parseHexChannel(a, 3)
  const b1 = parseHexChannel(a, 5)
  const r2 = parseHexChannel(b, 1)
  const g2 = parseHexChannel(b, 3)
  const b2 = parseHexChannel(b, 5)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const bCh = Math.round(b1 + (b2 - b1) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bCh.toString(16).padStart(2, '0')}`
}

/** Interpolates the color at an arbitrary position (0..100) across an already-sorted stops array. */
export function interpolateColorAtPosition(sortedStops: GradientStop[], position: number): string {
  if (sortedStops.length === 0) return '#ffffff'
  if (sortedStops.length === 1 || position <= sortedStops[0]!.position) {
    return sortedStops[0]!.color
  }
  if (position >= sortedStops[sortedStops.length - 1]!.position) {
    return sortedStops[sortedStops.length - 1]!.color
  }

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const a = sortedStops[i]!
    const b = sortedStops[i + 1]!
    if (position >= a.position && position <= b.position) {
      const range = b.position - a.position
      if (range === 0) return a.color
      const t = (position - a.position) / range
      return lerpHex(a.color, b.color, t)
    }
  }
  return sortedStops[0]!.color
}
