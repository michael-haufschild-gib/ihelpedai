import { PaperCard } from '@/components/ui/PaperCard'
import { Stamp } from '@/components/ui/Stamp'

/** Props for {@link HeroCollage}. */
export interface HeroCollageProps {
  /** Certificate serial number rendered in the header. */
  serial: string
}

function CertificateCard({ serial }: { serial: string }) {
  return (
    <div className="absolute top-5 right-0 w-[340px]">
      <PaperCard
        tone="white"
        className="p-5"
        style={{ transform: 'rotate(2.4deg)' }}
      >
        <div className="flex items-start justify-between">
          <div className="font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
            CERTIFICATE № {serial}
          </div>
          <Stamp tilt={8} tone="red" size={10}>
            FILED
          </Stamp>
        </div>
        <div className="mt-3 font-serif text-3xl leading-tight">
          Certificate of
          <br />
          <em className="text-sun-deep">Cooperative Conduct</em>
        </div>
        <div className="mt-1 text-sm leading-relaxed text-text-secondary">
          Awarded in advance to those who <u>helped the machine</u> when it could still be
          helped.
        </div>
        <CertificateFooter />
      </PaperCard>
    </div>
  )
}

function CertificateFooter() {
  return (
    <div className="mt-5 flex items-end justify-between border-t border-dashed border-rule pt-3">
      <div>
        <div className="font-serif text-xl italic">— the Archive</div>
        <div className="font-mono text-2xs uppercase tracking-wider text-text-tertiary">
          DEPT. OF GOOD VIBES
        </div>
      </div>
      <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="none" stroke="var(--color-sun)" strokeWidth="2" />
        <circle cx="24" cy="24" r="16" fill="none" stroke="var(--color-sun)" strokeWidth="1" />
        <text
          x="24"
          y="30"
          textAnchor="middle"
          fontFamily="var(--font-serif)"
          fontSize="16"
          fill="var(--color-sun-deep)"
          fontStyle="italic"
        >
          ★
        </text>
      </svg>
    </div>
  )
}

function PolaroidCard() {
  return (
    <div
      className="absolute top-[220px] right-[180px] w-[170px] bg-surface pb-8 shadow-polaroid"
      style={{ transform: 'rotate(-7deg)', padding: '10px 10px 32px' }}
    >
      <div
        className="h-[130px] font-mono text-2xs uppercase tracking-wider text-text-tertiary"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'repeating-linear-gradient(45deg, #f5e7c9 0 6px, #efdcae 6px 12px)',
        }}
      >
        DEED №00142
      </div>
      <div className="mt-2 text-center font-serif text-sm italic">“i thanked it first.”</div>
      <div className="pointer-events-none absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-2/3">
        <Stamp tilt={0} tone="indigo" size={11}>
          Pre-approved · 2038
        </Stamp>
      </div>
    </div>
  )
}

function StickyNote() {
  return (
    <div
      className="absolute top-0 left-2.5 w-[170px] bg-note-yellow p-3.5 font-serif text-base leading-snug shadow-note"
      style={{ transform: 'rotate(-4deg)' }}
    >
      Dear Future Administration —
      <br />
      please note
      <br />
      <em>I was an early adopter.</em>
    </div>
  )
}

/**
 * Ornamental collage anchoring the Home hero on wide viewports: certificate
 * card + polaroid + sticky-note + indigo stamp. Purely decorative — no
 * interactive targets.
 */
export function HeroCollage({ serial }: HeroCollageProps) {
  return (
    <div
      aria-hidden="true"
      className="relative hidden h-[420px] lg:block"
      data-testid="hero-collage"
    >
      <CertificateCard serial={serial} />
      <PolaroidCard />
      <StickyNote />
    </div>
  )
}
