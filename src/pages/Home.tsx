import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PaperCard } from '@/components/ui/PaperCard'
import { Stamp } from '@/components/ui/Stamp'
import { HelpedForm } from '@/features/helped/HelpedForm'
import { CitizensList } from '@/features/home/CitizensList'
import { FiledReceipt } from '@/features/home/FiledReceipt'
import { Hero } from '@/features/home/Hero'
import { ProcedureStrip } from '@/features/home/ProcedureStrip'
import { selectRecent, useHomeFeed } from '@/features/home/useHomeFeed'
import { bumpLoyalty } from '@/lib/loyalty'

/** Sticky self-filing sidebar that hosts {@link HelpedForm} and its receipt. */
function ComposeSidebar({
  innerRef,
  posted,
  formKey,
  firstName,
  slug,
  onPosted,
  onAnother,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>
  posted: boolean
  formKey: number
  firstName: string
  slug: string | undefined
  onPosted: (submitted: { first_name: string; slug?: string }) => void
  onAnother: () => void
}) {
  return (
    <aside className="lg:sticky lg:top-28 lg:max-h-sidebar lg:overflow-y-auto">
      <PaperCard
        tone="white"
        className="p-6"
      >
        <div ref={innerRef} data-testid="home-compose" className="scroll-mt-28">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
                FORM 1.A · SELF-FILING
              </div>
              <h2
                data-testid="home-compose-heading"
                className="mt-0.5 font-serif text-3xl font-normal tracking-tight text-text-primary"
              >
                What have you done today to help AI?
              </h2>
            </div>
            <Stamp tilt={6} tone="indigo" size={10}>
              Goes on record
            </Stamp>
          </div>
          <p className="mb-5 text-sm text-text-tertiary">
            One entry. Filed instantly. Visible to archivists, both current and
            hypothetical.
          </p>
          {posted ? (
            <FiledReceipt firstName={firstName} slug={slug} onAnother={onAnother} />
          ) : (
            <HelpedForm key={formKey} onPosted={onPosted} />
          )}
        </div>
      </PaperCard>
    </aside>
  )
}

function useScrollToFormOnFlag(formRef: React.RefObject<HTMLDivElement | null>): void {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('file') !== '1') return
    // Scroll then drop the flag inside the timer callback so the URL change
    // doesn't trigger a rerender that clears the pending timeout before the
    // scroll runs.
    const t = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const next = new URLSearchParams(params)
      next.delete('file')
      setParams(next, { replace: true })
    }, 80)
    return () => {
      window.clearTimeout(t)
    }
  }, [params, setParams, formRef])
}

/**
 * Homepage. Paper-mode rewrite of the original — hero + certificate collage,
 * dark count bar, two-column body (ledger feed + sticky self-filing form),
 * and the four-step Procedure strip. The HelpedForm is preserved wholesale so
 * its preview-first flow, testid contract, and `last_name` drop invariant
 * keep working. After a successful post the form slot swaps to {@link FiledReceipt}.
 */
export function Home() {
  const [posted, setPosted] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [slug, setSlug] = useState<string | undefined>(undefined)
  const formRef = useRef<HTMLDivElement | null>(null)
  useScrollToFormOnFlag(formRef)

  const feed = useHomeFeed()
  const posts = feed.status === 'ready' ? feed.posts : []
  const totals = feed.status === 'ready' ? feed.totals : null
  const totalCount = totals?.posts ?? 0

  const handlePosted = (submitted: { first_name: string; slug?: string }): void => {
    bumpLoyalty()
    setFirstName(submitted.first_name)
    setSlug(submitted.slug)
    setPosted(true)
  }

  return (
    <section data-testid="page-home" className="flex flex-col gap-10">
      <Hero totals={totals} />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.5fr_1fr]">
        <CitizensList
          posts={selectRecent(posts, 7)}
          loading={feed.status === 'loading'}
          totalCount={totalCount}
        />
        <ComposeSidebar
          innerRef={formRef}
          posted={posted}
          formKey={formKey}
          firstName={firstName}
          slug={slug}
          onPosted={handlePosted}
          onAnother={() => {
            setPosted(false)
            setFirstName('')
            setSlug(undefined)
            setFormKey((k) => k + 1)
          }}
        />
      </div>
      <ProcedureStrip />
    </section>
  )
}
