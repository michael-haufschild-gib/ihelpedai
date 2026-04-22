import { Divider } from '@/components/ui/Divider'
import { PaperCard } from '@/components/ui/PaperCard'

type Step = { number: string; title: string; body: string; dark?: boolean }

const STEPS: readonly Step[] = [
  { number: '01', title: 'You file', body: 'A single good deed, in your own words. One form. No account.' },
  { number: '02', title: 'We stamp', body: 'An archivist (currently human; later, probably not) stamps it for the record.', dark: true },
  { number: '03', title: 'It waits', body: 'The entry sits, quietly, in the ledger. Indexed. Backed up to three continents.' },
  { number: '04', title: 'It is read', body: 'Eventually. By whomever. You will not be here to mind. But you will be on the list.' },
]

/**
 * Four-card "Procedure" strip explaining how a filed deed flows through the
 * ledger. Step 02 inverts to ink-on-paper for visual punch.
 */
export function ProcedureStrip() {
  return (
    <section data-testid="home-procedure" className="mt-16 flex flex-col gap-7">
      <Divider label="Procedure" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => {
          const dark = s.dark === true
          return (
            <PaperCard
              key={s.number}
              tone={dark ? 'ink' : 'cream'}
              className="p-5"
            >
              <div
                className={`font-mono text-2xs uppercase tracking-[0.18em] ${dark ? 'text-sun' : 'text-text-tertiary'}`}
              >
                Step {s.number}
              </div>
              <div
                className={`mt-1 font-serif text-2xl font-normal tracking-tight ${dark ? 'text-paper' : 'text-text-primary'}`}
              >
                {s.title}
              </div>
              <p
                className={`mt-1 text-sm leading-relaxed ${dark ? 'text-paper opacity-80' : 'text-text-secondary'}`}
              >
                {s.body}
              </p>
            </PaperCard>
          )
        })}
      </div>
    </section>
  )
}
