/**
 * Color picker that supports both solid colors and linear gradients.
 *
 * Figma-style UI: solid/gradient mode switcher in the header,
 * solid mode shows the standard color picker panel,
 * gradient mode shows the gradient editor with inline stop color editing.
 */

import React, { useId, useState, useEffect, useCallback, useRef } from 'react'
import { Popover } from './Popover'
import { ColorPickerPanel } from './ColorPickerPanel'
import { GradientEditor } from './GradientEditor'
import { toCssGradientString, createDefaultGradient } from '@/lib/colors/gradientUtils'
import { isLinearGradient, type ColorOrGradient, type LinearGradientValue } from '@/types/gradient'
import { sx } from '@/lib/sx'

const CHECKERBOARD =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg=='

/** Props for the color/gradient picker with mode switcher. */
export interface ColorGradientPickerProps {
  value: ColorOrGradient
  onChange: (value: ColorOrGradient) => void
  label?: string
  className?: string
  disabled?: boolean
}

type PickerMode = 'solid' | 'gradient'

function SolidIcon({ active }: { active: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      className={`transition-colors ${active ? 'text-text-primary' : 'text-text-tertiary'}`}
    >
      <rect x={1} y={1} width={12} height={12} rx={2} fill="currentColor" />
    </svg>
  )
}

function GradientIcon({ active }: { active: boolean }) {
  const gradientId = useId()
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      className={`transition-colors ${active ? 'text-text-primary' : 'text-text-tertiary'}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={1} />
        </linearGradient>
      </defs>
      <rect x={1} y={1} width={12} height={12} rx={2} fill={`url(#${gradientId})`} />
    </svg>
  )
}

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: PickerMode
  onModeChange: (mode: PickerMode) => void
}) {
  return (
    <div
      data-popover-drag-handle="true"
      className="flex items-center gap-1 cursor-grab active:cursor-grabbing touch-none px-3 pt-3 pb-0"
      title="Drag to reposition"
    >
      <div className="flex bg-[var(--bg-active)] rounded p-0.5 gap-0.5">
        <button
          data-testid="color-gradient-mode-solid"
          onClick={() => onModeChange('solid')}
          className={`p-1.5 rounded-sm transition-all ${
            mode === 'solid' ? 'bg-[var(--bg-hover)] shadow-sm' : 'hover:bg-[var(--bg-hover)]/50'
          }`}
          title="Solid color"
        >
          <SolidIcon active={mode === 'solid'} />
        </button>
        <button
          data-testid="color-gradient-mode-gradient"
          onClick={() => onModeChange('gradient')}
          className={`p-1.5 rounded-sm transition-all ${
            mode === 'gradient' ? 'bg-[var(--bg-hover)] shadow-sm' : 'hover:bg-[var(--bg-hover)]/50'
          }`}
          title="Linear gradient"
        >
          <GradientIcon active={mode === 'gradient'} />
        </button>
      </div>
    </div>
  )
}

/**
 * Trigger swatch that shows solid color or gradient preview.
 */
function TriggerSwatch({ value, disabled }: { value: ColorOrGradient; disabled: boolean }) {
  const isGrad = isLinearGradient(value)
  const bgStyle = isGrad ? { background: toCssGradientString(value) } : { backgroundColor: value }
  const displayText = isGrad ? 'Gradient' : value

  return (
    <div
      className={`flex items-center gap-2 group p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      <div className="relative w-8 h-5 rounded overflow-hidden shadow-sm ring-1 ring-border-default group-hover:ring-border-strong transition-all">
        <div
          className="absolute inset-0 z-0"
          style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
        />
        <div className="absolute inset-0 z-10" style={sx(bgStyle)} />
      </div>
      <span className="text-xs font-mono text-text-tertiary group-hover:text-text-primary transition-colors truncate max-w-[100px]">
        {displayText}
      </span>
    </div>
  )
}

export const ColorGradientPicker: React.FC<ColorGradientPickerProps> = ({
  value,
  onChange,
  label,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  // Derive mode from current value
  const mode: PickerMode = isLinearGradient(value) ? 'gradient' : 'solid'

  // Cache the most recent solid/gradient in refs so that when the user switches modes
  // the other mode's last-known value is restored. Refs are written in effects and in
  // event handlers; never read during render.
  const lastSolidRef = useRef<string>(isLinearGradient(value) ? '#ffb400' : value)
  const lastGradientRef = useRef<LinearGradientValue>(
    isLinearGradient(value) ? value : createDefaultGradient()
  )

  useEffect(() => {
    if (isLinearGradient(value)) lastGradientRef.current = value
    else lastSolidRef.current = value
  }, [value])

  const handleModeChange = useCallback(
    (newMode: PickerMode) => {
      if (newMode === mode) return
      if (newMode === 'solid') onChange(lastSolidRef.current)
      else onChange(lastGradientRef.current)
    },
    [onChange, mode]
  )

  const handleSolidChange = useCallback(
    (color: string) => {
      lastSolidRef.current = color
      onChange(color)
    },
    [onChange]
  )

  const handleGradientChange = useCallback(
    (grad: LinearGradientValue) => {
      lastGradientRef.current = grad
      onChange(grad)
    },
    [onChange]
  )

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
    <div className={`flex items-center gap-2 ${className}`}>
      {label != null && label !== '' && (
        <span className="text-xs font-medium text-text-secondary select-none">{label}</span>
      )}
      <Popover
        open={isOpen}
        onOpenChange={handleOpenChange}
        offset={8}
        draggable
        trigger={<TriggerSwatch value={value} disabled={disabled} />}
        content={
          <div className="flex flex-col">
            <ModeSwitcher mode={mode} onModeChange={handleModeChange} />
            {mode === 'solid' && typeof value === 'string' ? (
              <ColorPickerPanel
                value={value}
                onChange={handleSolidChange}
                disableAlpha={false}
              />
            ) : null}
            {mode === 'gradient' && isLinearGradient(value) ? (
              <GradientEditor value={value} onChange={handleGradientChange} />
            ) : null}
          </div>
        }
      />
    </div>
  )
}
