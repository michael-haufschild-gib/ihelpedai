import { sx } from '@/lib/sx'

/** Props for the rounded-tile initial avatar (uses `rounded-xl`, not a circle). */
export interface AvatarProps {
  /** Display name; initials and color hue are derived from it. */
  name: string
  /** Tile size in px. */
  size?: number
  /**
   * When true (default), the tile is aria-hidden so it won't be announced
   * alongside adjacent visible name text. Set to false when the avatar
   * stands alone and needs to carry identity for assistive tech.
   */
  decorative?: boolean
}

// Normalize canonically equivalent sequences (precomposed vs combining
// characters) so "é" and "é" pick the same hue and initials.
function normalizeName(name: string): string {
  return name.normalize('NFC').trim()
}

function hueFor(normalized: string): number {
  // `for…of` iterates by Unicode code point so non-BMP names (emoji, supplementary
  // CJK) hash to a stable hue instead of summing surrogate halves.
  let sum = 0
  for (const ch of normalized) sum += ch.codePointAt(0) ?? 0
  return sum % 360
}

function initialsFor(normalized: string): string {
  const parts = normalized.split(/\s+/).filter((p) => p.length > 0)
  const picks = parts.slice(0, 2)
  // `Array.from` splits by code point, so a 4-byte emoji counts as one initial
  // instead of returning a lone surrogate.
  const out = picks.map((p) => Array.from(p)[0] ?? '').join('')
  return out.length > 0 ? out.toUpperCase() : '·'
}

/**
 * Deterministic initial-avatar tile. Hue derived from the character sum of
 * `name` so the same person gets the same colour across re-renders.
 */
export function Avatar({ name, size = 44, decorative = true }: AvatarProps) {
  const normalized = normalizeName(name)
  const hue = hueFor(normalized)
  const initials = initialsFor(normalized)
  const accessibleName = normalized.length > 0 ? normalized : 'unknown'
  return (
    <div
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `Avatar for ${accessibleName}`}
      role={decorative ? undefined : 'img'}
      className="flex shrink-0 items-center justify-center rounded-xl border border-rule font-serif text-lg font-medium text-text-primary"
      style={sx({
        width: size,
        height: size,
        background: `oklch(0.82 0.09 ${String(hue)}deg)`,
      })}
    >
      {initials}
    </div>
  )
}
