import React, { useState, useEffect, useCallback } from 'react'
import { Popover } from './Popover'
import { ColorPickerPanel } from './ColorPickerPanel'
import { sx } from '@/lib/sx'

const CHECKERBOARD =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg=='

/** Props for the ColorPicker component. */
export interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
  disabled?: boolean
  alpha?: number
  onChangeAlpha?: (alpha: number) => void
  disableAlpha?: boolean
}

/**
 * Solid-color picker with popover.
 * For gradient support, use ColorGradientPicker instead.
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  label,
  className = '',
  disabled = false,
  alpha,
  onChangeAlpha,
  disableAlpha = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])

  return (
    <div data-testid="color-picker" className={`flex items-center gap-2 ${className}`}>
      {label != null && label !== '' && (
        <span className="text-xs font-medium text-text-secondary select-none">{label}</span>
      )}
      <Popover
        open={isOpen}
        onOpenChange={handleOpenChange}
        offset={8}
        draggable
        trigger={
          <div
            className={`flex items-center gap-2 group p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <div className="relative w-8 h-5 rounded overflow-hidden shadow-sm ring-1 ring-border-default group-hover:ring-border-strong transition-all">
              <div
                className="absolute inset-0 z-0"
                style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
              />
              <div className="absolute inset-0 z-10" style={sx({ backgroundColor: value })} />
            </div>
            <span className="text-xs font-mono text-text-tertiary group-hover:text-text-primary transition-colors">
              {value}
            </span>
          </div>
        }
        content={
          <ColorPickerPanel
            value={value}
            onChange={onChange}
            alpha={alpha}
            onChangeAlpha={onChangeAlpha}
            disableAlpha={disableAlpha}
          />
        }
      />
    </div>
  )
}
