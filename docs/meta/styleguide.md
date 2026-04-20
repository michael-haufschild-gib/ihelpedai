# Style Guide (Immutable)

Violations are code-review rejections. Most are lint-enforced.

## CSS / Tailwind

| Forbidden | Required | Rule source |
|---|---|---|
| `bg-zinc-*`, `text-red-*`, `text-amber-*`, any raw Tailwind palette | Semantic tokens: `bg-app`, `bg-panel`, `bg-surface`, `text-text-primary/secondary/tertiary`, `text-danger`, `text-warning`, `text-accent`, `border-border-subtle/default` | `src/styles/theme.css` + `src/styles/index.css` |
| `text-[11px]`, `text-[0.7rem]` and other arbitrary font sizes | `text-3xs` / `text-2xs` / `text-2xs-plus` / `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` / `text-2xl`; extend `@theme` in `src/index.css` if a new tier is genuinely needed | `custom-rules/no-arbitrary-text-size` |
| Arbitrary widths/heights like `w-[240px]`, `min-w-[180px]`, `max-h-[80vh]` | Tailwind scale (`w-60`, `min-w-44`, `max-h-modal`); add a theme token if nothing fits | convention + review |
| Raw shadow strings `shadow-[0_0_Npx_var(--…)]` | `.shadow-accent-sm` / `.shadow-accent` / `.shadow-accent-lg` utilities in `src/styles/index.css` | convention |
| `!important` anywhere | Raise specificity properly or use a CSS variable | `custom-rules/no-important` |
| `z-index` > 100 in inline styles | Create a new stacking context | `custom-rules/no-excessive-z-index` |
| `eslint-disable` directives | Fix the code or configure the rule in `eslint.config.js` | `custom-rules/no-eslint-disable-comments` |

Root HTML has `data-app-theme=""` and `data-mode="dark-black"`. All semantic utility classes are scoped under `[data-app-theme]`. If tokens don't resolve, check that those attributes are set.

## Form controls

Raw `<button>/<input>/<select>/<textarea>` are **banned outside `src/components/ui/`**. Use the primitives: `Button`, `Input`, `Select`, `Textarea`. `<input type="hidden">` is allowed. Enforced by `custom-rules/no-raw-form-controls`.

If a primitive doesn't support a needed variant, extend the primitive — don't roll a one-off.

## Interactive elements

Every `<button>/<a>/<input>/<select>/<textarea>` and every element with an interactive `role=` must carry:
- `data-testid` — `kebab-case`, feature-scoped (e.g., `helped-submit`). Enforced by `custom-rules/require-data-testid`.
- `className` — no user-agent defaults. Enforced by `custom-rules/no-unstyled-interactive-elements`.

## Imports

- Use the `@/` path alias for any import that would need `../` to escape the current directory. `../foo` is allowed; `../../foo` and deeper is lint-blocked by `custom-rules/no-relative-parent-imports`.
- Named exports only. Default exports banned outside config files. `export const X = …` or `export function X() …`.
- `import type` for type-only imports (`verbatimModuleSyntax` is on).

Example:

```ts
import { Button } from '@/components/ui/Button'
import type { HelpedPostInput } from '@/lib/api'
```


## File length & function length

- `max-lines: 500` per file.
- `max-lines-per-function: 85` (skipBlankLines, skipComments).
- `max-depth: 4`.
- `sonarjs/cognitive-complexity: 15`.

Split components, don't disable. Tests are exempt from the function-length cap.

## JSDoc

Every exported function, class, interface, and type alias needs a one-sentence JSDoc (`publicOnly: true`, enforced by `jsdoc/require-jsdoc`). No `@param`/`@returns` required — TypeScript types cover that.

Template:

```ts
/** One-sentence summary of what this does (imperative, present tense). */
export function foo() { /* … */ }
```


## Privacy invariants (not lint-enforced — PR review enforced)

- **Last name is never stored.** Forms collect it, server drops it at the request boundary, stored rows have no `last_name` column. Keep `server/__tests__/last-name-discard.spec.ts` passing.
- **Every user-submitted free-text field runs through `sanitize()` server-side before insert.** Client mirrors in `src/lib/sanitizePreview.ts` for preview screens.
- **No file uploads.** No `multipart/form-data`, no `<input type="file">`, no binary body parsing.

## On-Demand References

| Topic | Source |
|---|---|
| Full CSS pattern examples (oklch, color-mix, etc.) | `src/styles/theme.css` + `src/styles/index.css` |
| JSDoc templates (components, hooks, utilities) | Inline examples in `src/components/ui/*.tsx` |
| Full code style detail | This file + `eslint.config.js` |
