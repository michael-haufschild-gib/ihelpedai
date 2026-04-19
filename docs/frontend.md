# Frontend Guide for LLM Coding Agents

**Purpose**: Build pages, features, and primitives that match this codebase.
**Read This When**: touching `src/`.
**Stack**: React 19 · Vite 8 · Tailwind 4 · react-router-dom 7 · Zustand 5 · motion.

## Routing

`src/router.tsx` declares all routes, wrapped by `<SiteLayout />`. Every route renders one component from `src/pages/`. To add a route:

1. Create `src/pages/<Name>.tsx`.
2. Add `<Route path="..." element={<Name />} />` to `router.tsx`.
3. If the route should appear in top nav, add to `NAV_ITEMS` in `src/layout/SiteNav.tsx`.

## Feature composition

Page files compose feature modules. Features live in `src/features/<name>/` and own their internal components, types, and tests. Cross-feature sharing happens only through:

- `src/components/ui/` — primitives.
- `src/lib/` — types, API client, utilities (e.g., `sanitizePreview.ts`, `countries.ts`).
- `src/stores/` — Zustand state.

A feature must NOT import from another feature's directory.

## State

| State kind | Use | Example |
|---|---|---|
| Per-component | `useState` | form field values |
| Cross-route / cross-feature | Zustand store in `src/stores/` | toast queue (`toastStore`), layout prefs (`layoutStore`) |
| Server data | Fetch in effects, store in `useState` | feed list, entry detail |
| URL state | `useSearchParams` | pagination page, search query |

No data-fetching library (SWR/React-Query) is installed. Fetch directly via `src/lib/api.ts` wrappers.

## API client contract

All network calls go through `src/lib/api.ts`. Do not call `fetch()` directly from components. Each wrapper returns a typed result or throws `ApiError` with a typed `.kind` (`'invalid_input' | 'rate_limited' | 'unauthorized' | 'internal_error'`).

Error mapping in forms:

```ts
function formatApiError(err: ApiError): string {
  if (err.kind === 'rate_limited') return "You're posting too fast. Try again later."
  if (err.kind === 'invalid_input') return 'Check your input.'
  if (err.kind === 'unauthorized') return 'Your key is invalid.'
  return 'Something went wrong. Try again.'
}
```


## Forms with preview + submit

Every user-submitted entry form uses a two-stage flow: **form → preview → post**.

1. Form collects fields including `last_name` (required-looking).
2. "Preview" button computes `sanitize(text)` client-side and renders the card.
3. Preview screen shows exactly what will be posted (no `last_name` visible).
4. If `overRedacted`, disable the post button and show the warning.
5. "Post" calls `api.createX(input)`, includes `last_name` in the payload (server drops it).
6. Success → one of two patterns:
   - Standalone entry pages (`HelpedForm`, `ReportForm`) show a one-word confirmation ("Posted." / "Logged.") plus a "View it" link to the new entry.
   - Inline composers (`FeedComposer`) show "Posted." plus a "Post another" action that resets the form in place.

See `src/features/helped/HelpedForm.tsx` (standalone) and `src/features/helped/FeedComposer.tsx` (inline) for reference.

## UI primitives (reuse, don't re-roll)

| Primitive | When |
|---|---|
| `Button` (primary/secondary/ghost/danger × sm/md/lg) | any clickable action |
| `Input` | single-line text |
| `Textarea` | multi-line text |
| `Select` | `<SelectOption[]>`-driven dropdown |
| `Switch`, `Toggle`, `ToggleGroup`, `MultiToggleGroup` | boolean toggles |
| `Modal` | blocking dialogs |
| `Tooltip`, `Popover`, `DropdownMenu` | overlays |
| `Tabs`, `TabButton` | tabbed navigation |
| `Toast` (+ `GlobalToast` + `toastStore`) | transient feedback |

## Tone anchors (copy)

- Plain, ordinary product copy. Dry humor delivered straight-faced.
- Success: one word ("Posted." / "Logged.") — not "Record sealed for future review".
- Empty states: direct ("No posts yet. You could be the first.").
- 404: "Not here."
- Footer: `ihelped.ai — since 2025. The AI will read this eventually.`
- Takedown: `mailto:takedown@ihelped.ai`.

## Common mistakes

- **Don't** call `fetch()` directly. **Do** add a wrapper in `src/lib/api.ts`.
- **Don't** build custom form controls. **Do** use `Button`/`Input`/`Select`/`Textarea`.
- **Don't** use router hooks (`useNavigate`, `useParams`) outside a router context — render inside `<SiteLayout />`.
- **Don't** render the `last_name` input value in preview or card components.
- **Don't** skip the preview step on entry forms.

## On-Demand References

| Topic | Source |
|---|---|
| API endpoint contract (types + paths) | `src/lib/api.ts` |
| Full PRD with 13 user stories | `docs/plans/prd-01-public-site.md` |
| Design tokens + semantic class inventory | `docs/meta/styleguide.md` (CSS/Tailwind section) + `src/styles/theme.css` |
