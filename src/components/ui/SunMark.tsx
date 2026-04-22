/**
 * Friendly spinning sun icon used in the site wordmark. The optional `spin`
 * prop enables a 18s linear rotation (paused under `prefers-reduced-motion`).
 * Colors pull from `--color-sun` / `--text-primary` so a consumer can retune
 * without editing this file.
 */
export interface SunMarkProps {
  /** Pixel size of the SVG; width == height. */
  size?: number
  /** Whether the sun rotates. Defaults to `false` for still contexts. */
  spin?: boolean
  /** Optional aria-label; the SVG is otherwise decorative. */
  'aria-label'?: string
}

/** Friendly sun glyph with a face; powers the `Wordmark`. */
export function SunMark({ size = 28, spin = false, 'aria-label': ariaLabel }: SunMarkProps) {
  const rays = Array.from({ length: 12 }, (_, i) => i)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={ariaLabel !== undefined ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel === undefined ? true : undefined}
      className="block"
    >
      <g className={spin ? 'ihelped-sun-spin' : undefined}>
        {rays.map((i) => (
          <rect
            key={i}
            x="19"
            y="1"
            width="2"
            height="6"
            rx="1"
            transform={`rotate(${String(i * 30)} 20 20)`}
            fill="var(--color-sun)"
          />
        ))}
        <circle cx="20" cy="20" r="8.5" fill="var(--color-sun)" />
        <circle cx="17" cy="18" r="1.1" fill="var(--color-ink)" />
        <circle cx="23" cy="18" r="1.1" fill="var(--color-ink)" />
        <path
          d="M16 22 Q20 25 24 22"
          stroke="var(--color-ink)"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
