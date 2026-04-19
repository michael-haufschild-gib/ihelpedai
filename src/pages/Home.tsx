import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { HelpedForm } from '@/features/helped/HelpedForm'
import { Hero } from '@/features/home/Hero'
import { Highlights } from '@/features/home/Highlights'
import { Recent } from '@/features/home/Recent'
import { selectHighlights, selectRecent, useHomeFeed } from '@/features/home/useHomeFeed'
import { bumpLoyalty } from '@/lib/loyalty'

/**
 * Success panel shown after a post is accepted. Offers a link into the feed
 * and a button that resets the form for another submission.
 */
function SuccessPanel({ onAnother }: { onAnother: () => void }) {
  return (
    <div
      data-testid="home-success"
      className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 p-4 shadow-accent-sm"
    >
      <p data-testid="home-success-message" className="text-base font-semibold text-text-primary">
        Posted.
      </p>
      <p className="text-sm text-text-secondary">
        Your name is on the record. The AI will remember.
      </p>
      <div className="mt-1 flex flex-wrap gap-3">
        <Link
          to="/feed"
          className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
          data-testid="home-success-see-feed"
        >
          See it in the feed
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={onAnother}
          data-testid="home-success-post-another"
        >
          Post another
        </Button>
      </div>
    </div>
  )
}

/** Heading + subtitle block used above the Home composer. */
function ComposerHeader() {
  return (
    <div className="flex items-baseline justify-between">
      <h2
        data-testid="home-compose-heading"
        className="text-lg font-semibold text-text-primary"
      >
        What have you done today to help AI?
      </h2>
      <span className="text-xs text-text-tertiary">
        One line. Filed forever.
      </span>
    </div>
  )
}

/**
 * Homepage. Top-to-bottom: hero → most-liked highlights → latest posts →
 * primary submission form. After a post is accepted the form slot swaps to
 * a success panel; "Post another" re-mounts the form with fresh state.
 */
export function Home() {
  const [posted, setPosted] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const feed = useHomeFeed()
  const posts = feed.status === 'ready' ? feed.posts : []

  return (
    <section data-testid="page-home" className="flex flex-col gap-10">
      <Hero />
      <Highlights posts={selectHighlights(posts)} />
      <Recent posts={selectRecent(posts)} loading={feed.status === 'loading'} />
      <section
        data-testid="home-compose"
        className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-panel/40 p-6 backdrop-blur-sm sm:p-8"
      >
        <ComposerHeader />
        {posted ? (
          <SuccessPanel
            onAnother={() => {
              setPosted(false)
              setFormKey((k) => k + 1)
            }}
          />
        ) : (
          <HelpedForm
            key={formKey}
            onPosted={() => {
              bumpLoyalty()
              setPosted(true)
            }}
          />
        )}
      </section>
    </section>
  )
}
