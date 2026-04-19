/**
 * EditorLeftPanel Component
 * Left panel shell — header + empty-state body.
 */

import type React from 'react'

export const EditorLeftPanel: React.FC = () => {
  return (
    <div className="h-full flex flex-col w-full shrink-0 overflow-hidden">
      <div className="p-4 border-b border-panel-border bg-panel-header/30 z-10 shrink-0">
        <h2 className="text-xs font-bold text-(--text-secondary) uppercase tracking-widest">
          Navigation
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border-default)] hover:scrollbar-thumb-[var(--border-highlight)] px-4 py-6">
        <p className="text-xs text-(--text-tertiary) text-center">Coming soon</p>
      </div>
    </div>
  )
}
