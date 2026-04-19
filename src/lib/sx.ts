import type { CSSProperties } from 'react'

/** Type-safe identity function for inline style objects. */
export const sx = <T extends CSSProperties>(styles: T): T => styles
