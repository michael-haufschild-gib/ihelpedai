import { Link } from 'react-router-dom'

/**
 * 404 page. Rendered by the router's wildcard route. Copy is fixed by PRD:
 * large "Not here." heading, a one-sentence explanation, and a plain link
 * back to the homepage.
 */
export function NotFound() {
  return (
    <section data-testid="page-not-found" className="flex flex-col gap-4">
      <h1 data-testid="page-not-found-heading" className="font-serif text-6xl font-normal tracking-tight text-text-primary">
        Not here.
      </h1>
      <p data-testid="page-not-found-body" className="text-base text-text-secondary">
        The ledger has no entry for this path. Yet.
      </p>
      <p className="text-base text-text-secondary">
        <Link
          to="/"
          className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
          data-testid="page-not-found-home"
        >
          Back to home
        </Link>
      </p>
    </section>
  )
}
