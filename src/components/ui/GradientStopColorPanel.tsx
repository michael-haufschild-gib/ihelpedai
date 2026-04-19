import React from 'react'
import { ColorPickerPanel } from './ColorPickerPanel'

/** Side panel for editing the color of a single gradient stop. */
export const GradientStopColorPanel: React.FC<{
  index: number
  color: string
  onChange: (c: string) => void
  onClose: () => void
}> = ({ index, color, onChange, onClose }) => (
  <div className="border-l border-border-subtle">
    <div className="flex items-center justify-between px-3 pt-2">
      <span className="text-xs text-text-tertiary font-medium">Stop {index + 1}</span>
      <button
        type="button"
        onClick={onClose}
        data-testid="gradient-stop-color-close"
        className="text-text-tertiary hover:text-text-primary text-xs p-0.5 transition-colors"
        aria-label="Close stop color editor"
      >
        ×
      </button>
    </div>
    <ColorPickerPanel
      value={color}
      onChange={onChange}
      disableAlpha
      showHeader={false}
      showPalette={false}
      width={220}
    />
  </div>
)
