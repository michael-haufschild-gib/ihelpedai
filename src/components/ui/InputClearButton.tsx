import type React from 'react'
import { m, AnimatePresence } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Animated clear button that appears inside an input field. */
export const InputClearButton: React.FC<{
  visible: boolean
  onClick: (e: React.MouseEvent) => void
}> = ({ visible, onClick }) => (
  <AnimatePresence>
    {visible && (
      <m.button
        data-testid="input-clear"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        type="button"
        aria-label="Clear input"
        title="Clear input"
        onClick={(e) => {
          e.stopPropagation()
          soundManager.playClick()
          onClick(e)
        }}
        className="text-text-tertiary hover:text-text-primary rounded-full p-0.5 hover:bg-[var(--bg-active)] transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </m.button>
    )}
  </AnimatePresence>
)
