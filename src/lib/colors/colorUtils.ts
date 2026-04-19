/** Hue-Saturation-Value-Alpha color representation (all channels 0-1). */
export interface HSVA {
  h: number // 0-1
  s: number // 0-1
  v: number // 0-1
  a: number // 0-1
}

/** Red-Green-Blue-Alpha color representation (RGB 0-255, Alpha 0-1). */
export interface RGBA {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
  a: number // 0-1
}

/**
 * Parses a hex color string to RGB values.
 * Supports #RGB, #RRGGBB formats.
 */
const parseHexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  let h = hex.replace('#', '')

  // Expand shorthand (#RGB -> #RRGGBB)
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }

  if (h.length !== 6) return null

  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null

  return { r, g, b }
}

/**
 * Parses a named color using canvas (browser API).
 * Returns null if not in browser or invalid color.
 */
const parseNamedColor = (name: string): { r: number; g: number; b: number } | null => {
  if (typeof document === 'undefined') return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = name
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data

    return { r: data[0]!, g: data[1]!, b: data[2]! }
  } catch {
    return null
  }
}

/** Parses an alpha value that may be a percentage ('5%') or a decimal ('0.05'). */
const parseAlphaValue = (raw: string): number => {
  if (raw.endsWith('%')) {
    return parseFloat(raw) / 100
  }
  return parseFloat(raw)
}

/**
 * Parses any valid color string into HSVA.
 * Supports: Hex, Hex8, RGB, RGBA (comma and modern space-separated), named colors.
 * Falls back to black if invalid.
 */
export const parseColorToHsv = (input: string): HSVA => {
  // 1. Try Hex/Hex8
  if (input.startsWith('#')) {
    const hex = input.substring(1)
    if (hex.length === 3 || hex.length === 6) {
      return hexToHsv(input)
    }
    if (hex.length === 4 || hex.length === 8) {
      return hex8ToHsv(input)
    }
  }

  // 2. Try comma-separated RGB/RGBA: rgb(236, 195, 255) / rgba(236, 195, 255, 0.5)
  const rgbaMatch = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+%?))?\)/)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]!, 10)
    const g = parseInt(rgbaMatch[2]!, 10)
    const b = parseInt(rgbaMatch[3]!, 10)
    const a = rgbaMatch[4] !== undefined ? parseAlphaValue(rgbaMatch[4]) : 1
    return rgbToHsv(r, g, b, a)
  }

  // 3. Try modern space-separated: rgb(236 195 255) / rgb(236 195 255 / 5%) / rgb(236 195 255 / 0.05)
  const modernMatch = input.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+%?))?\s*\)/)
  if (modernMatch) {
    const r = parseInt(modernMatch[1]!, 10)
    const g = parseInt(modernMatch[2]!, 10)
    const b = parseInt(modernMatch[3]!, 10)
    const a = modernMatch[4] !== undefined ? parseAlphaValue(modernMatch[4]) : 1
    return rgbToHsv(r, g, b, a)
  }

  // 4. Try named color via canvas
  const namedRgb = parseNamedColor(input)
  if (namedRgb) {
    const { h, s, v } = rgbToHsvStruct(namedRgb.r, namedRgb.g, namedRgb.b)
    return { h, s, v, a: 1 }
  }

  // Fallback to black
  return { h: 0, s: 0, v: 0, a: 1 }
}

/** Converts Hex (6 char) to HSVA (Alpha=1). */
export const hexToHsv = (hex: string): HSVA => {
  const rgb = parseHexToRgb(hex)
  if (!rgb) return { h: 0, s: 0, v: 0, a: 1 }

  const { h, s, v } = rgbToHsvStruct(rgb.r, rgb.g, rgb.b)
  return { h, s, v, a: 1 }
}

/** Converts Hex8 (#RRGGBBAA) to HSVA. */
export const hex8ToHsv = (hex8: string): HSVA => {
  let hex = hex8.replace('#', '')
  if (hex.length === 4) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }

  if (hex.length !== 8) return { h: 0, s: 0, v: 0, a: 1 }

  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const a = parseInt(hex.substring(6, 8), 16) / 255

  return rgbToHsv(r, g, b, a)
}

/** Helper: RGB to HSV structure. */
const rgbToHsvStruct = (r: number, g: number, b: number) => {
  const rN = r / 255
  const gN = g / 255
  const bN = b / 255

  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const d = max - min

  const s = max === 0 ? 0 : d / max
  const v = max
  let h = 0

  if (max !== min) {
    switch (max) {
      case rN:
        h = (gN - bN) / d + (gN < bN ? 6 : 0)
        break
      case gN:
        h = (bN - rN) / d + 2
        break
      case bN:
        h = (rN - gN) / d + 4
        break
    }
    h /= 6
  }
  return { h, s, v }
}

/** Converts RGB(A) to HSVA. */
export const rgbToHsv = (r: number, g: number, b: number, a: number = 1): HSVA => {
  const { h, s, v } = rgbToHsvStruct(r, g, b)
  return { h, s, v, a }
}

/** Converts HSVA to Hex (6 char) — ignores alpha. */
export const hsvToHex = (h: number, s: number, v: number): string => {
  const { r, g, b } = hsvToRgbStruct(h, s, v)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

/** Converts HSVA to Hex8 (#RRGGBBAA). */
export const hsvToHex8 = (h: number, s: number, v: number, a: number): string => {
  const hex = hsvToHex(h, s, v)
  const alpha = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${alpha}`
}

/** Converts HSVA to RGB object. */
export const hsvToRgb = (h: number, s: number, v: number, a: number = 1): RGBA => {
  const { r, g, b } = hsvToRgbStruct(h, s, v)
  return { r, g, b, a }
}

/** Converts RGB (0-255) to Hex string. */
export const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0')
  return '#' + toHex(r) + toHex(g) + toHex(b)
}

/** Helper: HSV to RGB struct. */
const hsvToRgbStruct = (h: number, s: number, v: number) => {
  let r = 0,
    g = 0,
    b = 0
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  switch (i % 6) {
    case 0:
      r = v
      g = t
      b = p
      break
    case 1:
      r = q
      g = v
      b = p
      break
    case 2:
      r = p
      g = v
      b = t
      break
    case 3:
      r = p
      g = q
      b = v
      break
    case 4:
      r = t
      g = p
      b = v
      break
    case 5:
      r = v
      g = p
      b = q
      break
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

/** Validates Hex (3, 4, 6, or 8 digits). */
export const isValidHex = (hex: string): boolean => {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex)
}

/** Generates tints and shades from an HSV color. */
export const generatePalette = (h: number, s: number, v: number, count: number = 4): string[] => {
  const palette: string[] = []

  // Tints (lighter)
  for (let i = count; i > 0; i--) {
    const factor = i / (count + 1)
    palette.push(hsvToHex(h, s * (1 - factor), Math.min(1, v + (1 - v) * factor)))
  }

  // Shades (darker)
  for (let i = 1; i <= count; i++) {
    const factor = i / (count + 1)
    palette.push(hsvToHex(h, s, Math.max(0, v * (1 - factor))))
  }

  return palette
}
