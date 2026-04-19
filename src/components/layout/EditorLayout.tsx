/**
 * EditorLayout Component
 * Two-panel layout: top bar, left navigation panel, center content.
 * Glassmorphic UI with theme scoping via data attributes.
 */

import React, { useEffect } from 'react'
import {
  hasReducedMotionListener,
  initPrefersReducedMotion,
  prefersReducedMotion,
} from 'motion/react'
import * as m from 'motion/react-m'
import { AnimatePresence } from 'motion/react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { syncReducedMotionStyles } from '@/lib/syncReducedMotionStyles'
import { EditorTopBar } from '@/components/layout/EditorTopBar'
import { EditorLeftPanel } from '@/components/layout/EditorLeftPanel'

interface EditorLayoutProps {
  children?: React.ReactNode
}

const TOP_BAR_OFFSET_PX = 64

const SPRING_CONFIG = {
  type: 'spring' as const,
  damping: 25,
  stiffness: 300,
  mass: 0.8,
}

const panelVariants = {
  hiddenLeft: { x: -340, opacity: 0, scale: 0.95 },
  visible: { x: 0, opacity: 1, scale: 1, transition: SPRING_CONFIG },
}

const sidePanelOffsetStyle: React.CSSProperties = {
  marginTop: `${TOP_BAR_OFFSET_PX}px`,
  height: `calc(100% - ${TOP_BAR_OFFSET_PX}px)`,
}

/** Observe head mutations so late-loaded stylesheets get reduced-motion mirrored. */
function useReducedMotionSync() {
  useEffect(() => {
    syncReducedMotionStyles()

    const linkLoadHandlers: Array<[HTMLLinkElement, () => void]> = []
    const observer = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          const tag = (node as Element).tagName
          if (tag === 'STYLE') {
            syncReducedMotionStyles()
            return
          }
          if (tag === 'LINK') {
            const link = node as HTMLLinkElement
            const handler = () => syncReducedMotionStyles()
            link.addEventListener('load', handler, { once: true })
            linkLoadHandlers.push([link, handler])
          }
        }
      }
    })
    observer.observe(document.head, { childList: true })

    return () => {
      observer.disconnect()
      for (const [link, handler] of linkLoadHandlers) {
        link.removeEventListener('load', handler)
      }
    }
  }, [])
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({ children }) => {
  const { leftPanelVisible, theme, accent, reducedMotion } = useLayoutStore(
    useShallow((state: LayoutStore) => ({
      leftPanelVisible: state.showLeftPanel,
      theme: state.theme,
      accent: state.accent,
      reducedMotion: state.reducedMotion,
    }))
  )

  useEffect(() => {
    if (!hasReducedMotionListener.current) initPrefersReducedMotion()
  }, [])

  useEffect(() => {
    prefersReducedMotion.current = reducedMotion === 'reduce'
  }, [reducedMotion])

  useReducedMotionSync()

  return (
    <div
      data-app-theme
      data-mode={theme}
      data-accent={accent}
      data-reduced-motion={reducedMotion === 'reduce' ? 'reduce' : undefined}
      className="pf-shell-backdrop relative h-screen supports-[height:100dvh]:h-dvh w-screen overflow-hidden"
    >
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="relative z-10 flex flex-col h-full w-full pointer-events-none"
        style={{ color: 'var(--text-primary)' }}
      >
        <div className="pointer-events-auto absolute inset-x-0 top-0 z-50">
          <EditorTopBar />
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden relative p-2 gap-2">
          <AnimatePresence mode="popLayout">
            {leftPanelVisible && (
              <m.div
                initial="hiddenLeft"
                animate="visible"
                exit="hiddenLeft"
                variants={panelVariants}
                data-testid="left-panel"
                className="glass-panel rounded-xl h-full overflow-hidden w-80 pointer-events-auto flex flex-col relative z-20"
                style={sidePanelOffsetStyle}
              >
                <div className="w-full h-full overflow-hidden">
                  <EditorLeftPanel />
                </div>
              </m.div>
            )}
          </AnimatePresence>

          <div
            className="flex-1 flex flex-col min-w-0 relative z-0 pointer-events-auto overflow-auto pt-16"
            data-testid="editor-center-pane"
            tabIndex={0}
          >
            {children}
          </div>
        </div>
      </m.div>
    </div>
  )
}
