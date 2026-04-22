import { sx } from '@/lib/sx'

/** Props for the circular initial avatar. */
export interface AvatarProps {
  /** Display name; initials and color hue are derived from it. */
  name: string
  /** Tile size in px. */
  size?: number
}

function hueFor(name: string): number {
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  return sum % 360
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0)
  const picks = parts.slice(0, 2)
  const out = picks.map((p) => p[0] ?? '').join('')
  return out.length > 0 ? out.toUpperCase() : '·'
}

/**
 * Deterministic initial-avatar tile. Hue derived from the character sum of
 * `name` so the same person gets the same colour across re-renders.
 */
export function Avatar({ name, size = 44 }: AvatarProps) {
  const hue = hueFor(name)
  const initials = initialsFor(name)
  return (
    <div
      aria-hidden="true"
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
