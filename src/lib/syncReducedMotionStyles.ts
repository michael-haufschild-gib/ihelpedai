/**
 * Mirrors @media (prefers-reduced-motion: reduce) rules into a dynamic
 * stylesheet scoped to [data-reduced-motion='reduce']. This lets the catalog
 * toggle activate CSS reduced-motion alternatives without changing the OS
 * setting. One-direction only: force reduce when OS says no-preference.
 *
 * Animation CSS files keep portable @media queries — this is catalog-only glue.
 */

const STYLE_ID = 'catalog-reduced-motion-mirror'
const SCOPE = "[data-reduced-motion='reduce']"

/**
 * Scan all stylesheets and mirror prefers-reduced-motion rules under a
 * data-attribute selector. Call once on mount and again when lazy groups
 * load new CSS (detected via MutationObserver on <head>).
 */
export function syncReducedMotionStyles(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  const mirrored: string[] = []

  for (const sheet of document.styleSheets) {
    try {
      extractReducedMotionRules(sheet.cssRules, mirrored)
    } catch {
      // Cross-origin stylesheets throw SecurityError — skip
    }
  }

  style.textContent = mirrored.join('\n')
}

function isQuoteChar(ch: string): ch is '"' | "'" {
  return ch === '"' || ch === "'"
}

function updateNesting(ch: string, paren: number, bracket: number): [number, number] {
  if (ch === '(') return [paren + 1, bracket]
  if (ch === ')') return [Math.max(0, paren - 1), bracket]
  if (ch === '[') return [paren, bracket + 1]
  if (ch === ']') return [paren, Math.max(0, bracket - 1)]
  return [paren, bracket]
}

function pushTrimmed(parts: string[], raw: string): void {
  const trimmed = raw.trim()
  if (trimmed !== '') parts.push(trimmed)
}

/** Splits a CSS selector list at top-level commas, respecting parens/brackets/quotes. */
function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = []
  let current = ''
  let parenDepth = 0
  let bracketDepth = 0
  let quote: '"' | "'" | null = null

  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i]!

    if (quote !== null) {
      current += ch
      if (ch === quote && selectorText[i - 1] !== '\\') quote = null
      continue
    }
    if (isQuoteChar(ch)) {
      quote = ch
      current += ch
      continue
    }
    ;[parenDepth, bracketDepth] = updateNesting(ch, parenDepth, bracketDepth)

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      pushTrimmed(parts, current)
      current = ''
      continue
    }
    current += ch
  }
  pushTrimmed(parts, current)
  return parts
}

/** Mirrors the inner rules of a reduced-motion media query under the data-attribute scope. */
function mirrorMediaRuleContents(mediaRule: CSSMediaRule, out: string[]): void {
  for (const inner of mediaRule.cssRules) {
    if (inner instanceof CSSStyleRule) {
      const scopedSelector = splitSelectorList(inner.selectorText)
        .map((s) => `${SCOPE} ${s}`)
        .join(', ')
      const cssText = inner.cssText
      const braceStart = cssText.indexOf('{')
      const body = braceStart >= 0 ? cssText.slice(braceStart) : `{ ${inner.style.cssText} }`
      out.push(`${scopedSelector} ${body}`)
    }
    // @keyframes inside the media query — emit globally so the scoped
    // style rules above can reference the reduced keyframe names.
    if (inner instanceof CSSKeyframesRule) {
      out.push(inner.cssText)
    }
  }
}

function isReducedMotionMedia(rule: CSSRule): rule is CSSMediaRule {
  return (
    rule instanceof CSSMediaRule && /prefers-reduced-motion:\s*reduce/i.test(rule.conditionText)
  )
}

function hasNestedRules(rule: CSSRule): boolean {
  return 'cssRules' in rule && ((rule as CSSGroupingRule).cssRules?.length ?? 0) > 0
}

function extractReducedMotionRules(rules: CSSRuleList, out: string[]): void {
  for (const rule of rules) {
    if (isReducedMotionMedia(rule)) {
      mirrorMediaRuleContents(rule, out)
      continue
    }
    // Recurse into @layer, @supports, non-reduced @media, etc.
    if (hasNestedRules(rule)) {
      extractReducedMotionRules((rule as CSSGroupingRule).cssRules, out)
    }
  }
}
