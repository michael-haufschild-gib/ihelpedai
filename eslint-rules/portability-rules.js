/**
 * Custom ESLint rules for code quality and portability.
 *
 * - no-relative-parent-imports: force @/ alias over ../
 * - no-important: ban `!important` in inline style strings
 * - no-excessive-z-index: cap inline z-index values
 * - require-data-testid: interactive elements need data-testid
 * - no-unstyled-interactive-elements: interactive elements need className
 * - no-eslint-disable-comments: ban eslint-disable/disable-next-line/disable-line directives
 * - no-arbitrary-text-size: ban Tailwind `text-[Npx]` (and rem/em/pt/%) in className strings
 */

import { getFilename, isConfigFile } from './rule-helpers.js'

const INTERACTIVE_ELEMENTS = new Set(['button', 'a', 'input', 'textarea', 'select'])

function getJsxName(node) {
  if (node.name.type === 'JSXIdentifier') return node.name.name
  return null
}

function getAttr(openingElement, attrName) {
  return openingElement.attributes.find(
    (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === attrName,
  )
}

function hasRoleInteractive(openingElement) {
  const roleAttr = getAttr(openingElement, 'role')
  if (!roleAttr || !roleAttr.value || roleAttr.value.type !== 'Literal') return false
  const role = roleAttr.value.value
  return (
    role === 'button' ||
    role === 'link' ||
    role === 'checkbox' ||
    role === 'switch' ||
    role === 'tab' ||
    role === 'menuitem'
  )
}

const portabilityRules = {
  'no-relative-parent-imports': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Disallow relative parent imports (../) in src/. Use the @/ path alias instead for portability and grep-ability.',
      },
      schema: [],
      messages: {
        useAlias:
          'Use "@/..." path alias instead of relative parent import "{{ source }}". Relative parents break when files move.',
      },
    },
    create(context) {
      const f = getFilename(context)
      if (!f.includes('/src/')) return {}
      return {
        ImportDeclaration(node) {
          const src = node.source.value
          if (typeof src !== 'string') return
          if (src.startsWith('../')) {
            context.report({ node: node.source, messageId: 'useAlias', data: { source: src } })
          }
        },
      }
    },
  },

  'no-important': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ban `!important` in inline style strings. Escalation hatches defeat cascade reasoning and block theming.',
      },
      schema: [],
      messages: {
        noImportant:
          'Remove `!important` — raise specificity via proper selectors or CSS variables instead.',
      },
    },
    create(context) {
      function check(node, text) {
        if (typeof text !== 'string') return
        if (/!\s*important/i.test(text)) {
          context.report({ node, messageId: 'noImportant' })
        }
      }
      return {
        Literal(node) {
          check(node, node.value)
        },
        TemplateElement(node) {
          check(node, node.value.raw)
        },
      }
    },
  },

  'no-excessive-z-index': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Disallow z-index values above 100 in inline styles. Escalating z-index wars indicate stacking context bugs.',
      },
      schema: [{ type: 'object', properties: { max: { type: 'number' } }, additionalProperties: false }],
      messages: {
        tooHigh:
          'z-index {{ value }} exceeds {{ max }}. Create a new stacking context via `isolation: isolate` or `position: relative; z-index: 0` on an ancestor.',
      },
    },
    create(context) {
      const options = context.options[0] || {}
      const max = typeof options.max === 'number' ? options.max : 100
      return {
        Property(node) {
          const key = node.key
          const keyName =
            key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
          if (keyName !== 'zIndex' && keyName !== 'z-index') return
          if (node.value.type !== 'Literal') return
          const v = node.value.value
          const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
          if (Number.isFinite(n) && n > max) {
            context.report({ node: node.value, messageId: 'tooHigh', data: { value: String(n), max: String(max) } })
          }
        },
      }
    },
  },

  'require-data-testid': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Require data-testid on interactive elements for stable E2E selectors.',
      },
      schema: [],
      messages: {
        missing: '<{{ tag }}> is interactive — add data-testid="..." for stable selectors.',
      },
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          const name = getJsxName(node)
          if (!name) return
          const isInteractive = INTERACTIVE_ELEMENTS.has(name) || hasRoleInteractive(node)
          if (!isInteractive) return
          if (getAttr(node, 'data-testid')) return
          if (getAttr(node, 'aria-hidden')) return
          context.report({ node, messageId: 'missing', data: { tag: name } })
        },
      }
    },
  },

  'no-eslint-disable-comments': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ban eslint-disable, eslint-disable-next-line, eslint-disable-line, and block eslint-disable/enable directives. Fix the code or configure the rule in eslint.config.js instead.',
      },
      schema: [],
      messages: {
        banned:
          'eslint-disable directives are forbidden. Restructure the code so the rule passes, or configure a per-file override in eslint.config.js.',
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      return {
        Program() {
          for (const comment of sourceCode.getAllComments()) {
            if (/\beslint-(?:disable|enable)(?:-next-line|-line)?\b/.test(comment.value)) {
              context.report({ loc: comment.loc, messageId: 'banned' })
            }
          }
        },
      }
    },
  },

  'no-arbitrary-text-size': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ban arbitrary Tailwind font-size utilities like `text-[11px]`, `text-[0.625rem]`, `text-[14pt]`. Use the central typography scale (text-3xs, text-2xs, text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, …). Extend the scale in `src/index.css` `@theme` if a missing tier is genuinely needed.',
      },
      schema: [],
      messages: {
        arbitrary:
          'Arbitrary font-size utility "{{ match }}" is banned — use the semantic scale (text-xs / text-sm / text-base / text-lg / text-xl / text-2xl, or text-3xs / text-2xs / text-2xs-plus for sub-xs tiers). Extend `@theme` in src/index.css if you truly need a new tier.',
      },
    },
    create(context) {
      const pattern = /text-\[[^\]]*(?:\d|\.)(?:px|rem|em|pt|%)\s*\]/g
      function check(node, text) {
        if (typeof text !== 'string') return
        let m
        while ((m = pattern.exec(text)) !== null) {
          context.report({ node, messageId: 'arbitrary', data: { match: m[0] } })
        }
        pattern.lastIndex = 0
      }
      return {
        Literal(node) {
          if (typeof node.value === 'string') check(node, node.value)
        },
        TemplateElement(node) {
          check(node, node.value.raw)
        },
      }
    },
  },

  'no-unstyled-interactive-elements': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Interactive elements (button, a, input) must carry a className. Unstyled elements indicate missing design integration.',
      },
      schema: [],
      messages: {
        missing:
          '<{{ tag }}> has no className — add styling (Tailwind classes or component wrapper) instead of relying on user-agent defaults.',
      },
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          const name = getJsxName(node)
          if (!name || !INTERACTIVE_ELEMENTS.has(name)) return
          if (name === 'input') {
            const typeAttr = getAttr(node, 'type')
            if (typeAttr && typeAttr.value && typeAttr.value.type === 'Literal') {
              const t = typeAttr.value.value
              if (t === 'hidden') return
            }
          }
          if (getAttr(node, 'className')) return
          context.report({ node, messageId: 'missing', data: { tag: name } })
        },
      }
    },
  },
}

// Apply config-file exemption at rule registration — config files legitimately use
// relative parents and may not need testids.
for (const rule of Object.values(portabilityRules)) {
  const originalCreate = rule.create
  rule.create = (context) => {
    if (isConfigFile(context)) return {}
    return originalCreate(context)
  }
}

export { portabilityRules }
