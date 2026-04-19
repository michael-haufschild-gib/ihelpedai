/**
 * Standalone color picker panel (no popover wrapper).
 *
 * This is the "guts" of the ColorPicker: saturation area, hue/alpha sliders,
 * hex/RGB inputs, palette, and history. Used directly inside ColorPicker's
 * Popover and by GradientEditor for per-stop color editing.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { parseColorToHsv, type HSVA } from '@/lib/colors/colorUtils'
import { useColorPickerState } from '@/lib/useColorPickerState'
import { showToast } from '@/stores/toastStore'
import { logger } from '@/services/logger'
import { m as MotionEl } from 'motion/react'
import { sx } from '@/lib/sx'
import { ColorInputs } from './ColorPickerInputs'

/** Props for the standalone color picker panel (no popover). */
export interface ColorPickerPanelProps {
  value: string
  onChange: (value: string) => void
  /** Optional label — only shown when `showHeader` is true. */
  label?: string
  alpha?: number
  onChangeAlpha?: (alpha: number) => void
  disableAlpha?: boolean
  /** Show the header with before/after swatch, eyedropper, copy. Default true. */
  showHeader?: boolean
  /** Show palette and history rows. Default true. */
  showPalette?: boolean
  /** Width of the panel. Default 260. */
  width?: number
}

const ICON_PROPS = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const CHECKERBOARD =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg=='

const NOISE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`

const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'

// ── Sub-components ──────────────────────────────────────────────────────

function PanelHeader({
  initialColor,
  value,
  onEyedropper,
  onCopy,
}: {
  initialColor: string
  value: string
  onEyedropper: () => void
  onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 bg-[var(--bg-hover)] rounded-full p-0.5 border border-border-subtle">
        <div
          className="relative w-12 h-6 rounded-full overflow-hidden flex cursor-help"
          title="Original vs New"
        >
          <div
            className="absolute inset-0 -z-10"
            style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
          />
          <div className="w-1/2 h-full" style={sx({ backgroundColor: initialColor })} />
          <div className="w-1/2 h-full" style={sx({ backgroundColor: value })} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        {typeof window !== 'undefined' && 'EyeDropper' in window && (
          <MotionEl.button
            data-testid="color-picker-eyedropper"
            onClick={onEyedropper}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-text-tertiary hover:text-text-primary transition-colors"
            title="Pick color"
          >
            <svg {...ICON_PROPS}>
              <path d="M2 22l5-5 5-5 5 5-5 5-5-5z" />
              <path d="M17 7l-5 5" />
              <path d="M14 2l8 8" />
            </svg>
          </MotionEl.button>
        )}
        <MotionEl.button
          data-testid="color-picker-copy"
          onClick={onCopy}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-text-tertiary hover:text-text-primary transition-colors"
          title="Copy to clipboard"
        >
          <svg {...ICON_PROPS}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </MotionEl.button>
      </div>
    </div>
  )
}

function SaturationArea({
  hsv,
  svRef,
  onMouseDown,
  onHsvChange,
}: {
  hsv: HSVA
  svRef: React.RefObject<HTMLDivElement | null>
  onMouseDown: (e: React.MouseEvent) => void
  onHsvChange: (hsv: HSVA) => void
}) {
  const STEP = 0.02
  const handleKeyDown = (e: React.KeyboardEvent) => {
    let { s, v } = hsv
    switch (e.key) {
      case 'ArrowRight':
        s = Math.min(1, s + STEP)
        break
      case 'ArrowLeft':
        s = Math.max(0, s - STEP)
        break
      case 'ArrowUp':
        v = Math.min(1, v + STEP)
        break
      case 'ArrowDown':
        v = Math.max(0, v - STEP)
        break
      case 'Home':
        s = 0
        v = 0
        break
      case 'End':
        s = 1
        v = 1
        break
      default:
        return
    }
    e.preventDefault()
    onHsvChange({ ...hsv, s, v })
  }

  return (
    <div
      ref={svRef}
      className="w-full h-[160px] rounded-lg relative cursor-crosshair overflow-hidden shadow-lg ring-1 ring-border-default group"
      onMouseDown={onMouseDown}
      onKeyDown={handleKeyDown}
      style={sx({ backgroundColor: `hsl(${String(hsv.h * 360)}, 100%, 50%)` })}
      role="application"
      aria-label={`Saturation ${String(Math.round(hsv.s * 100))}%, Brightness ${String(Math.round(hsv.v * 100))}%`}
      aria-roledescription="2D color area"
      tabIndex={0}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      <div
        className="absolute inset-0 mix-blend-overlay opacity-30 pointer-events-none"
        style={sx({ backgroundImage: NOISE_BG })}
      />
      <div
        className="absolute w-4 h-4 rounded-full shadow-lg border-2 border-text-primary pointer-events-none -translate-x-1/2 -translate-y-1/2 transform transition-transform duration-75 ease-out group-active:scale-75"
        style={sx({ left: `${String(hsv.s * 100)}%`, top: `${String((1 - hsv.v) * 100)}%` })}
      />
    </div>
  )
}

function ColorSliders({
  hsv,
  disableAlpha,
  onHsvChange,
}: {
  hsv: HSVA
  disableAlpha: boolean
  onHsvChange: (hsv: HSVA) => void
}) {
  return (
    <div className="space-y-3">
      <div className="h-3 rounded-full relative overflow-hidden ring-1 ring-border-default cursor-pointer group">
        <div className="absolute inset-0" style={sx({ background: HUE_GRADIENT })} />
        <MotionEl.input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={hsv.h}
          onChange={(e) => {
            onHsvChange({ ...hsv, h: parseFloat(e.target.value) })
          }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
          aria-label="Hue"
        />
        <div
          className="absolute top-0 bottom-0 w-2 h-full bg-white shadow-md rounded-full pointer-events-none -translate-x-1/2 transition-transform group-active:scale-110"
          style={sx({ left: `${String(hsv.h * 100)}%` })}
        />
      </div>
      {!disableAlpha && (
        <div className="h-3 rounded-full relative overflow-hidden ring-1 ring-border-default cursor-pointer group">
          <div
            className="absolute inset-0 z-0"
            style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
          />
          <div
            className="absolute inset-0 z-1"
            style={sx({
              background: 'linear-gradient(to right, #ffffff, #000000)',
            })}
          />
          <MotionEl.input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={hsv.a}
            onChange={(e) => {
              onHsvChange({ ...hsv, a: parseFloat(e.target.value) })
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
            aria-label="Opacity"
          />
          <div
            className="absolute top-0 bottom-0 w-2 h-full bg-white shadow-md rounded-full pointer-events-none -translate-x-1/2 z-30 transition-transform group-active:scale-110"
            style={sx({ left: `${String(hsv.a * 100)}%` })}
          />
        </div>
      )}
    </div>
  )
}


function PaletteHistory({
  palette,
  history,
  onSelect,
}: {
  palette: string[]
  history: string[]
  onSelect: (c: string) => void
}) {
  return (
    <div className="space-y-2 pt-1">
      <div className="flex gap-1 justify-between">
        {palette.map((c) => (
          <MotionEl.button
            data-testid="color-picker-hsv-change"
            key={c}
            onClick={() => {
              onSelect(c)
            }}
            className="w-6 h-6 rounded-md border border-border-subtle hover:scale-110 hover:border-border-strong transition-all shadow-sm"
            style={sx({ backgroundColor: c })}
            title={c}
          />
        ))}
      </div>
      {history.length > 0 && (
        <div className="flex gap-1.5 flex-wrap pt-2 border-t border-border-subtle">
          {history.map((c) => (
            <MotionEl.button
              data-testid="color-picker-hsv-change-2"
              key={c}
              onClick={() => {
                onSelect(c)
              }}
              className="w-5 h-5 rounded-full border border-border-default hover:scale-110 hover:border-border-strong transition-all shadow-sm relative overflow-hidden"
              title="History"
            >
              <div
                className="absolute inset-0 -z-10"
                style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
              />
              <div className="absolute inset-0" style={sx({ backgroundColor: c })} />
            </MotionEl.button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function computeSV(el: HTMLDivElement, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect()
  const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  return { s, v }
}

function pickEyedropper(onColor: (hsv: HSVA) => void) {
  if (!('EyeDropper' in window)) return
  const dropper = new (
    window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }
  ).EyeDropper()
  void dropper
    .open()
    .then((result) => onColor(parseColorToHsv(result.sRGBHex)))
    .catch(() => {})
}

function copyColor(value: string) {
  void navigator.clipboard.writeText(value).then(
    () => showToast('Color copied to clipboard'),
    (err) => logger.warn('Clipboard write failed — browser may have denied access', err)
  )
}

// ── Main Panel Component ────────────────────────────────────────────────

export const ColorPickerPanel: React.FC<ColorPickerPanelProps> = ({
  value,
  onChange,
  alpha,
  onChangeAlpha,
  disableAlpha = false,
  showHeader = true,
  showPalette = true,
  width = 260,
}) => {
  const state = useColorPickerState({ value, onChange, alpha, onChangeAlpha, disableAlpha })
  const { hsv, handleHsvChange } = state

  const [initialColor] = useState(value)
  const svRef = useRef<HTMLDivElement>(null)
  const [isDraggingSV, setIsDraggingSV] = useState(false)

  const updateSV = useCallback(
    (clientX: number, clientY: number) => {
      if (!svRef.current) return
      const { s, v } = computeSV(svRef.current, clientX, clientY)
      handleHsvChange({ ...hsv, s, v })
    },
    [hsv, handleHsvChange]
  )

  // Stable ref so the drag effect doesn't re-subscribe listeners on every HSV change
  const updateSVRef = useRef(updateSV)
  useEffect(() => {
    updateSVRef.current = updateSV
  }, [updateSV])

  useEffect(() => {
    if (!isDraggingSV) return
    const onMove = (e: MouseEvent) => updateSVRef.current(e.clientX, e.clientY)
    const onUp = () => setIsDraggingSV(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDraggingSV])

  const handleEyedropper = () => pickEyedropper(handleHsvChange)
  const handleCopy = () => copyColor(value)

  return (
    <div
      className="p-3 flex flex-col gap-3 select-none text-text-primary"
      style={sx({ width: `${String(width)}px` })}
    >
      {showHeader && (
        <PanelHeader
          initialColor={initialColor}
          value={value}
          onEyedropper={handleEyedropper}
          onCopy={handleCopy}
        />
      )}
      <SaturationArea
        hsv={hsv}
        svRef={svRef}
        onMouseDown={(e) => {
          e.preventDefault()
          setIsDraggingSV(true)
          updateSV(e.clientX, e.clientY)
        }}
        onHsvChange={handleHsvChange}
      />
      <ColorSliders hsv={hsv} disableAlpha={disableAlpha} onHsvChange={handleHsvChange} />
      <ColorInputs state={state} disableAlpha={disableAlpha} value={value} />
      {showPalette && (
        <PaletteHistory
          palette={state.palette}
          history={state.history}
          onSelect={(c) => {
            handleHsvChange(parseColorToHsv(c))
          }}
        />
      )}
    </div>
  )
}
