import js from '@eslint/js'
import eslintReact from '@eslint-react/eslint-plugin'
import eslintConfigPrettier from 'eslint-config-prettier'
import jsdoc from 'eslint-plugin-jsdoc'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import testingLibrary from 'eslint-plugin-testing-library'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import { portabilityRules } from './eslint-rules/portability-rules.js'
import { testingRules } from './eslint-rules/testing-rules.js'

const customRulesPlugin = {
  rules: { ...portabilityRules, ...testingRules },
}

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'test-results',
    'playwright-report',
    'blob-report',
    'node_modules',
    '.claude',
    'docs',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintReact.configs.recommended,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.test.json', './tsconfig.e2e.json', './tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      jsdoc,
      sonarjs,
      'custom-rules': customRulesPlugin,
    },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          contexts: [
            'FunctionDeclaration',
            'ClassDeclaration',
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
          ],
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'no-console': 'error',
      'sonarjs/cognitive-complexity': ['error', 15],
      complexity: 'off',
      'max-depth': ['error', 4],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            'NodeJS.Timeout': {
              message:
                'Use ReturnType<typeof setTimeout> instead — NodeJS namespace is unavailable in browser builds.',
              suggest: ['ReturnType<typeof setTimeout>'],
            },
            'NodeJS.Timer': {
              message:
                'Use ReturnType<typeof setTimeout> instead — NodeJS namespace is unavailable in browser builds.',
              suggest: ['ReturnType<typeof setTimeout>'],
            },
          },
        },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: true,
          allowNullableNumber: false,
          allowNullableEnum: false,
          allowAny: false,
        },
      ],
      '@eslint-react/dom/no-dangerously-set-innerhtml': 'error',
      // Custom portability rules
      'custom-rules/no-relative-parent-imports': 'error',
      'custom-rules/no-important': 'error',
      'custom-rules/no-excessive-z-index': 'error',
      'custom-rules/require-data-testid': 'error',
      'custom-rules/no-unstyled-interactive-elements': 'error',
      'custom-rules/no-eslint-disable-comments': 'error',
      'custom-rules/no-arbitrary-text-size': 'error',
      'custom-rules/no-raw-form-controls': 'error',
    },
  },
  // Source code quality gates: line limits and default export ban.
  // Config files are exempt — their APIs require default exports.
  {
    files: ['**/*.js', '**/*.ts', '**/*.tsx'],
    ignores: ['**/*.config.js', '**/*.config.cjs', '**/*.config.mjs', '**/*.config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'Default exports are banned. Use named exports: `export const X = ...` or `export function X()`. Config files are exempt.',
        },
      ],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 85, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  // Server integration specs (node env). Pick up the shallow-assertion custom
  // rule without dragging in the testing-library/* react-oriented rules.
  {
    files: ['server/**/*.spec.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'max-depth': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'custom-rules/no-shallow-assertions': 'error',
    },
  },
  // Test files (React component tests)
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.{ts,tsx}'],
    plugins: { 'testing-library': testingLibrary },
    rules: {
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'max-depth': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'custom-rules/no-shallow-assertions': 'error',

      ...testingLibrary.configs['flat/react'].rules,
      'testing-library/prefer-screen-queries': 'error',
      'testing-library/no-node-access': 'error',
      'testing-library/no-container': 'error',
      'testing-library/await-async-queries': 'error',
      'testing-library/prefer-find-by': 'error',
      'testing-library/prefer-presence-queries': 'error',
      'testing-library/no-manual-cleanup': 'error',
      'testing-library/no-unnecessary-act': 'error',
      'testing-library/no-render-in-lifecycle': 'error',
      'testing-library/no-debugging-utils': 'error',
      'testing-library/prefer-explicit-assert': 'error',
      'testing-library/render-result-naming-convention': 'off',

      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are banned. Use named exports.',
        },
        {
          selector: 'CallExpression[callee.object.name="it"][callee.property.name="skip"]',
          message: 'No it.skip — fix or remove the test.',
        },
        {
          selector: 'CallExpression[callee.object.name="test"][callee.property.name="skip"]',
          message: 'No test.skip — fix or remove the test.',
        },
        {
          selector: 'CallExpression[callee.object.name="describe"][callee.property.name="skip"]',
          message: 'No describe.skip — fix or remove the test suite.',
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(get|query|find)(All)?By(Role|LabelText|PlaceholderText|AltText|Title|DisplayValue|Text)$/]',
          message:
            'Use getByTestId / queryByTestId / findByTestId with data-testid attributes. Role/label/text queries are brittle under copy and i18n changes.',
        },
        {
          selector:
            'CallExpression[callee.name=/^(get|query|find)(All)?By(Role|LabelText|PlaceholderText|AltText|Title|DisplayValue|Text)$/]',
          message:
            'Use getByTestId / queryByTestId / findByTestId with data-testid attributes. Role/label/text queries are brittle under copy and i18n changes.',
        },
      ],
    },
  },
  // E2E tests (Playwright)
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'custom-rules/no-relative-parent-imports': 'off',
      '@eslint-react/rules-of-hooks': 'off',
      'jsdoc/require-jsdoc': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'max-depth': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'custom-rules/no-class-id-locators': 'error',
      'custom-rules/no-waitfor-timeout': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^getBy(Role|Label|Placeholder|AltText|Title|Text)$/]',
          message:
            'Use page.getByTestId() with data-testid attributes. Role/label/text locators are brittle under copy and i18n changes.',
        },
      ],
    },
  },
  // Custom rule files: no line-per-function limit (rule bodies are long)
  {
    files: ['eslint-rules/**/*.js'],
    rules: {
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  // Test setup: cleanup() is the whole point of this file
  {
    files: ['src/test/setup.ts'],
    rules: {
      'testing-library/no-manual-cleanup': 'off',
    },
  },
  // Logger: the single allowed entry point for direct console.* calls.
  {
    files: ['src/services/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
])
