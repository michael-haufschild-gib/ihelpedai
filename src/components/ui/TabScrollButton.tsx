import type React from 'react'
import { m } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Arrow button for scrolling a tab list left or right. */
export const TabScrollButton: React.FC<{
  direction: 'left' | 'right'
  onClick: () => void
}> = ({ direction, onClick }) => {
  const points = direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'
  const posClass = direction === 'left' ? 'left-0' : 'right-0'

  return (
    <m.button
      data-testid={`tabs-scroll-${direction}`}
      type="button"
      aria-label={direction === 'left' ? 'Scroll tabs left' : 'Scroll tabs right'}
      onClick={() => {
        soundManager.playClick()
        onClick()
      }}
      onMouseEnter={() => soundManager.playHover()}
      className={`absolute ${posClass} top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-panel/90 border border-border-subtle backdrop-blur-sm shadow-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-panel transition-colors cursor-pointer [&>svg]:pointer-events-none`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points={points} />
      </svg>
    </m.button>
  )
}
