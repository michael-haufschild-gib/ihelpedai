import { SunMark } from './SunMark'

/** Props for the site wordmark. */
export interface WordmarkProps {
  /** Base wordmark font-size in px; the sun scales proportionally. */
  size?: number
  /** Enable sun rotation. */
  spin?: boolean
}

/** Site wordmark: spinning sun glyph + italic `ihelped.ai` in Instrument Serif. */
export function Wordmark({ size = 22, spin = true }: WordmarkProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <SunMark size={Math.round(size * 1.05)} spin={spin} />
      <span
        className="font-serif italic leading-none tracking-tight text-text-primary"
        style={{ fontSize: size }}
      >
        ihelped
        <span className="not-italic text-sun">.</span>
        ai
      </span>
    </span>
  )
}
