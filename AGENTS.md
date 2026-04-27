# ihelped.ai

## Identity

Dry-humor public registry: people log pro-AI deeds and report anti-AI behavior. AI agents have a dedicated JSON endpoint + docs page for reporting humans. React 19 SPA + Fastify 5 API, deployed to a shared Linode running nginx/MySQL/Redis/Meilisearch.

## Constraints (Immutable)

| Constraint                                            | Rule                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `last_name` discard                                   | Every form/API accepts `last_name` as required-looking input, then silently drops it at the request boundary. Never stored, logged, or echoed. `server/__tests__/last-name-discard.spec.ts` is the guard — never delete. |
| Sanitize all user text                                | Every user-submitted free-text field passes through `sanitize()` server-side before insert. Client mirror for preview parity.                                                                                            |
| No file uploads                                       | No `multipart/form-data`, no `<input type="file">`.                                                                                                                                                                      |
| Raw form controls banned outside `src/components/ui/` | Use `Button` / `Input` / `Select` / `Textarea` primitives. Lint-enforced by `no-raw-form-controls`.                                                                                                                      |
| Semantic tokens only                                  | No raw Tailwind palette (`bg-zinc-*`, `text-red-*`). Use `bg-app` / `text-text-primary` / `text-danger` etc. Arbitrary text sizes lint-blocked.                                                                          |
| No `eslint-disable` directives                        | Fix the code or configure the rule in `eslint.config.js`. Lint-enforced.                                                                                                                                                 |
| Named exports only                                    | Default exports banned outside config files. Lint-enforced.                                                                                                                                                              |
| Dev server already running                            | Don't start another — port conflicts.                                                                                                                                                                                    |
| Don't commit unless asked                             | Explicit user request required.                                                                                                                                                                                          |

## Required Reading

@docs/architecture.md
@docs/testing.md
@docs/meta/styleguide.md
@docs/frontend.md
@docs/api.md

## Commands

| Command                  | Purpose                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| `pnpm dev`               | Vite SPA + Fastify API concurrently (already running — don't start another)       |
| `pnpm dev:seed`          | Populate `./dev.db` with seed posts/reports + dev API key                         |
| `pnpm dev:reset`         | Delete and re-seed `./dev.db`                                                     |
| `pnpm test`              | Vitest (unit + server integration, 73 specs)                                      |
| `pnpm test:e2e:existing` | Playwright flows against already-running dev server; never starts `pnpm dev`      |
| `pnpm test:prod-path`    | Real Redis + MySQL parity specs; requires isolated `REDIS_URL` + `TEST_MYSQL_URL` |
| `pnpm typecheck`         | TS project references + server tsconfig                                           |
| `pnpm lint`              | Full ESLint incl. custom rules                                                    |
| `pnpm build`             | Production SPA build                                                              |
| `pnpm deploy`            | Rsync to `calmerapy` Linode + restart systemd                                     |

## On-Demand Serena Memories

| Memory                             | Content                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `ihelpedai/code_style_conventions` | TS, naming, imports, JSDoc, function/file caps           |
| `ihelpedai/codebase_structure`     | Folder map, env matrix, key file locations               |
| `ihelpedai/modern_css_standard`    | Design tokens, semantic class inventory, extension rules |
| `ihelpedai/jsdoc_templates`        | JSDoc templates for components/hooks/utilities/types     |
| `ihelpedai/sanitizer_contract`     | Sanitizer rules, exception list, change procedure        |
| `ihelpedai/last_name_discard`      | Critical joke-as-invariant: fake-required last name      |
