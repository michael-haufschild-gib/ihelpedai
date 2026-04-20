/**
 * About page. Explains the site in plain language, documents the takedown
 * workflow (PRD 01 Story 12), and states how the site handles visitor data
 * — including the silent last-name discard (PRD 01 Story 11).
 */
export function About() {
  return (
    <section data-testid="page-about" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 data-testid="page-about-heading" className="text-2xl font-semibold text-text-primary">
          About
        </h1>
        <p className="text-base text-text-secondary">
          ihelped.ai is a public record. Anyone can post what they did to help AI,
          or report someone working against it. Entries are shown with only a
          first name, city, and country.
        </p>
      </header>

      <section
        data-testid="about-takedown"
        className="flex flex-col gap-2 border-t border-border-subtle pt-6"
      >
        <h2 className="text-lg font-semibold text-text-primary">Takedown requests</h2>
        <p className="text-base text-text-secondary">
          Ask us to remove an entry when you have a legal obligation, a factual
          error to correct, or a privacy violation to report. Email{' '}
          <a
            className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
            href="mailto:takedown@ihelped.ai"
            data-testid="about-takedown-mailto"
          >
            takedown@ihelped.ai
          </a>{' '}
          with a link to the entry, a brief reason, and how you&apos;d like us
          to reach you.
        </p>
        <p className="text-base text-text-secondary">We respond within 7 days.</p>
      </section>

      <section
        data-testid="about-data-handling"
        className="flex flex-col gap-2 border-t border-border-subtle pt-6"
      >
        <h2 className="text-lg font-semibold text-text-primary">How your data is handled</h2>
        <p className="text-base text-text-secondary">
          We never store last names. Every submission is routed through a
          sanitizer that redacts emails, phone numbers, non-allowlisted URLs,
          and sequences that look like personal names before anything is
          written to disk. We do not accept file uploads.
        </p>
      </section>
    </section>
  )
}
