/**
 * Gradient data types for color-or-gradient props.
 *
 * These types power the ColorGradientPicker UI and are consumed
 * by animation components that accept gradient fills (e.g. starburst rays).
 */

/** A single color stop in a gradient. */
export interface GradientStop {
  /** Hex color string (e.g. '#ff0000'). */
  color: string
  /** Position along the gradient axis, 0–100. */
  position: number
}

/** Linear gradient value with angle and color stops. */
export interface LinearGradientValue {
  type: 'linear-gradient'
  /** CSS-convention angle in degrees (0 = bottom→top, 90 = left→right). */
  angle: number
  /** Ordered color stops. Min 2, max 8. */
  stops: GradientStop[]
}

/**
 * A color value that is either a solid CSS color string or a linear gradient.
 * Used as the value type for `color-or-gradient` prop configs.
 */
export type ColorOrGradient = string | LinearGradientValue

/** Type guard: is the value a structured linear gradient object? */
export function isLinearGradient(value: ColorOrGradient): value is LinearGradientValue {
  return typeof value === 'object' && value !== null && value.type === 'linear-gradient'
}

/**
 * Converts a CSS gradient angle to SVG linearGradient coordinates
 * for use with `gradientUnits="userSpaceOnUse"`.
 *
 * userSpaceOnUse applies one gradient across the entire SVG coordinate space,
 * so all paths (e.g. ray wedges) share a single coherent gradient.
 *
 * CSS angle convention: 0deg = bottom→top, increases clockwise.
 * SVG: origin top-left, y increases downward.
 *
 * @param angle CSS angle in degrees
 * @param size  SVG viewBox size (square)
 * @returns Coordinate pairs for SVG linearGradient attributes
 */
export function toSvgGradientCoords(
  angle: number,
  size: number
): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const half = size / 2
  return {
    x1: half - half * dx,
    y1: half - half * dy,
    x2: half + half * dx,
    y2: half + half * dy,
  }
}
