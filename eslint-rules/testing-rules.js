/**
 * Custom ESLint rules for test quality.
 *
 * Unit tests:
 * - no-shallow-assertions: ban bare existence/truthiness checks without context
 *
 * E2E tests (Playwright):
 * - no-class-id-locators: ban CSS class/id selectors in page.locator()
 * - no-waitfor-timeout: ban page.waitForTimeout — flaky arbitrary delays
 */

import { getFilename } from './rule-helpers.js'

const SHALLOW_MATCHERS = new Set([
  'toBeTruthy',
  'toBeFalsy',
  'toBeDefined',
  'toBeUndefined',
  'toBeNull',
])

function isExpectCall(node) {
  // node is CallExpression whose callee is a chain ending in expect(x).<matcher>()
  let cur = node.callee
  while (cur && cur.type === 'MemberExpression') {
    cur = cur.object
  }
  return cur && cur.type === 'CallExpression' && cur.callee.type === 'Identifier' && cur.callee.name === 'expect'
}

function getMatcherName(node) {
  if (node.callee.type !== 'MemberExpression') return null
  const prop = node.callee.property
  if (prop.type !== 'Identifier') return null
  return prop.name
}

const testingRules = {
  'no-shallow-assertions': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ban shallow existence/truthiness matchers. Assert concrete values so tests catch regressions.',
      },
      schema: [],
      messages: {
        shallow:
          '`{{ matcher }}` is a shallow assertion — assert a concrete value (toBe, toEqual, toHaveTextContent, etc.) so the test catches real regressions.',
      },
    },
    create(context) {
      const f = getFilename(context)
      if (!/\.(test|spec)\.[tj]sx?$/.test(f)) return {}
      return {
        CallExpression(node) {
          const matcher = getMatcherName(node)
          if (!matcher || !SHALLOW_MATCHERS.has(matcher)) return
          if (!isExpectCall(node)) return
          context.report({ node: node.callee.property, messageId: 'shallow', data: { matcher } })
        },
      }
    },
  },

  'no-class-id-locators': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ban CSS class/id selectors in Playwright locator() calls. Use getByTestId or getByRole for stability.',
      },
      schema: [],
      messages: {
        classId:
          'locator("{{ selector }}") uses a CSS class/id — brittle. Prefer getByTestId, getByRole, or data-testid attribute selectors.',
      },
    },
    create(context) {
      const f = getFilename(context)
      if (!f.includes('/e2e/') && !f.includes('/tests/e2e/')) return {}
      return {
        CallExpression(node) {
          if (node.callee.type !== 'MemberExpression') return
          const prop = node.callee.property
          if (prop.type !== 'Identifier' || prop.name !== 'locator') return
          const arg = node.arguments[0]
          if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return
          const sel = arg.value.trim()
          if (sel.startsWith('.') || sel.startsWith('#')) {
            context.report({ node: arg, messageId: 'classId', data: { selector: sel } })
          }
        },
      }
    },
  },

  'no-waitfor-timeout': {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ban page.waitForTimeout() in E2E tests — flaky arbitrary delays. Use expect(locator).toBeVisible() or waitForFunction.',
      },
      schema: [],
      messages: {
        noTimeout:
          'waitForTimeout() is a flaky arbitrary delay. Use an expect-based wait (e.g. toBeVisible, toHaveText) or waitForFunction.',
      },
    },
    create(context) {
      const f = getFilename(context)
      if (!f.includes('/e2e/') && !f.includes('/tests/e2e/')) return {}
      return {
        CallExpression(node) {
          if (node.callee.type !== 'MemberExpression') return
          const prop = node.callee.property
          if (prop.type !== 'Identifier' || prop.name !== 'waitForTimeout') return
          context.report({ node: node.callee.property, messageId: 'noTimeout' })
        },
      }
    },
  },
}

export { testingRules }
