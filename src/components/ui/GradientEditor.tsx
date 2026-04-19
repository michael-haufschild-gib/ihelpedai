/**
 * Figma-style linear gradient editor.
 *
 * Features:
 * - Preview bar with draggable stop markers (Motion drag)
 * - Scrollable stop list with color swatch, position %, delete
 * - Angle slider
 * - Inline color picker panel for the selected stop (side-by-side layout)
 */

import React, { useCallback, useRef, useState, useMemo } from 'react'
import { ColorPickerPanel } from './ColorPickerPanel'
import { toCssGradientString, nextStopId } from '@/lib/colors/gradientUtils'
import { sx } from '@/lib/sx'
import type { GradientStop, LinearGradientValue } from '@/types/gradient'

const MIN_STOPS = 2
const MAX_STOPS = 8
const MARKER_SIZE = 16
const MARKER_HIT_SIZE = 28

const CHECKERBOARD =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg=='

interface StopWithKey extends GradientStop {
  key: string
}

/** Props for the gradient editor panel. */
export interface GradientEditorProps {
  value: LinearGradientValue
  onChange: (value: LinearGradientValue) => void
}

// ── Gradient preview bar with markers ───────────────────────────────────

function GradientPreviewBar({
  gradient,
  stops,
  selectedIndex,
  onSelectStop,
  onStopPositionChange,
  onAddStop,
}: {
  gradient: LinearGradientValue
  stops: StopWithKey[]
  selectedIndex: number
  onSelectStop: (index: number) => void
  onStopPositionChange: (index: number, position: number) => void
  onAddStop: (position: number, color: string) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const sortedStops = useMemo(
    () => gradient.stops.slice().sort((a, b) => a.position - b.position),
    [gradient.stops]
  )
  const cssGradient = toCssGradientString({ ...gradient, angle: 90, stops: sortedStops })

  const positionFromClient = useCallback((clientX: number): number => {
    if (!barRef.current) return 0
    const rect = barRef.current.getBoundingClientRect()
    if (rect.width === 0) return 0
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }, [])

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-gradient-marker]')) return
      if (stops.length >= MAX_STOPS) return
      const pos = positionFromClient(e.clientX)
      // Interpolate color at position from sorted stops
      const color = interpolateColorAtPosition(sortedStops, pos)
      onAddStop(pos, color)
    },
    [stops.length, positionFromClient, sortedStops, onAddStop]
  )

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary font-medium">Gradient</span>
        <span className="text-xs text-text-tertiary font-mono">{String(gradient.angle)}°</span>
      </div>
      <div
        ref={barRef}
        className="relative h-8 rounded-md ring-1 ring-border-default cursor-crosshair overflow-visible"
        onClick={handleBarClick}
      >
        <div
          className="absolute inset-0 -z-10 rounded-md"
          style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
        />
        <div className="absolute inset-0 rounded-md" style={sx({ background: cssGradient })} />
        {/* Stop markers */}
        {stops.map((stop, i) => (
          <GradientMarker
            key={stop.key}
            stop={stop}
            index={i}
            isSelected={i === selectedIndex}
            barRef={barRef}
            onSelect={() => onSelectStop(i)}
            onPositionChange={(pos) => onStopPositionChange(i, pos)}
          />
        ))}
      </div>
    </div>
  )
}

function GradientMarker({
  stop,
  index,
  isSelected,
  barRef,
  onSelect,
  onPositionChange,
}: {
  stop: GradientStop
  index: number
  isSelected: boolean
  barRef: React.RefObject<HTMLDivElement | null>
  onSelect: () => void
  onPositionChange: (position: number) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startPosRef = useRef(0)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onSelect()
      setIsDragging(true)
      startXRef.current = e.clientX
      startPosRef.current = stop.position
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [onSelect, stop.position]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      if (rect.width === 0) return
      const deltaPercent = ((e.clientX - startXRef.current) / rect.width) * 100
      const newPos = Math.max(0, Math.min(100, startPosRef.current + deltaPercent))
      onPositionChange(Math.round(newPos * 10) / 10)
    },
    [isDragging, barRef, onPositionChange]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div
      data-gradient-marker
      data-testid={`gradient-marker-${String(index)}`}
      className={`absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none flex items-center justify-center ${isSelected ? 'z-20' : 'z-10'}`}
      style={sx({
        left: `calc(${String(stop.position)}% - ${String(MARKER_HIT_SIZE / 2)}px)`,
        width: `${String(MARKER_HIT_SIZE)}px`,
        height: `${String(MARKER_HIT_SIZE)}px`,
      })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className={`rounded-full border-2 shadow-md transition-transform ${
          isSelected
            ? 'border-white ring-2 ring-accent scale-110'
            : 'border-white/80 hover:scale-110'
        }`}
        style={sx({
          backgroundColor: stop.color,
          width: `${String(MARKER_SIZE)}px`,
          height: `${String(MARKER_SIZE)}px`,
        })}
      />
    </div>
  )
}

// ── Stop list ───────────────────────────────────────────────────────────

function StopList({
  stops,
  selectedIndex,
  onSelectStop,
  onRemoveStop,
  onStopPositionChange,
}: {
  stops: StopWithKey[]
  selectedIndex: number
  onSelectStop: (index: number) => void
  onRemoveStop: (index: number) => void
  onStopPositionChange: (index: number, position: number) => void
}) {
  return (
    <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
      {stops.map((stop, i) => (
        <div
          key={stop.key}
          data-testid={`gradient-stop-${String(i)}`}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
            i === selectedIndex
              ? 'relative z-10 bg-[var(--bg-active)] outline outline-1 outline-accent/40'
              : 'hover:bg-[var(--bg-hover)]'
          }`}
          onClick={() => onSelectStop(i)}
        >
          {/* Color swatch */}
          <div className="w-5 h-5 rounded border border-border-default shrink-0 relative overflow-hidden">
            <div
              className="absolute inset-0 -z-10"
              style={sx({ backgroundImage: `url(${CHECKERBOARD})`, opacity: 0.4 })}
            />
            <div className="absolute inset-0" style={sx({ backgroundColor: stop.color })} />
          </div>

          {/* Hex value */}
          <span className="text-xs font-mono text-text-secondary flex-1 truncate">
            {stop.color}
          </span>

          {/* Position */}
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(stop.position)}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!Number.isNaN(val)) {
                  onStopPositionChange(i, Math.max(0, Math.min(100, val)))
                }
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`gradient-stop-position-${String(i)}`}
              className="w-10 bg-transparent text-xs font-mono text-text-primary outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-text-tertiary">%</span>
          </div>

          {/* Delete */}
          {stops.length > MIN_STOPS && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemoveStop(i)
              }}
              className="text-text-tertiary hover:text-danger text-sm p-1 shrink-0 transition-colors"
              aria-label={`Remove stop ${i + 1}`}
              data-testid={`gradient-stop-delete-${String(i)}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Angle control ───────────────────────────────────────────────────────

function AngleControl({ angle, onChange }: { angle: number; onChange: (angle: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-tertiary font-medium shrink-0">Angle</span>
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={angle}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        data-testid="gradient-angle-slider"
        className="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
        aria-label="Gradient angle"
      />
      <div className="flex items-center gap-0.5">
        <input
          type="number"
          min={0}
          max={360}
          step={1}
          value={angle}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            if (!Number.isNaN(val)) onChange(((val % 360) + 360) % 360)
          }}
          data-testid="gradient-angle-input"
          className="w-10 bg-[var(--bg-hover)] border border-border-default rounded px-1 py-0.5 text-xs font-mono text-text-primary outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-text-tertiary">°</span>
      </div>
    </div>
  )
}

// ── Color interpolation helper ──────────────────────────────────────────

function interpolateColorAtPosition(sortedStops: GradientStop[], position: number): string {
  if (sortedStops.length === 0) return '#ffffff'
  if (sortedStops.length === 1 || position <= sortedStops[0]!.position) {
    return sortedStops[0]!.color
  }
  if (position >= sortedStops[sortedStops.length - 1]!.position) {
    return sortedStops[sortedStops.length - 1]!.color
  }

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const a = sortedStops[i]!
    const b = sortedStops[i + 1]!
    if (position >= a.position && position <= b.position) {
      const range = b.position - a.position
      if (range === 0) return a.color
      const t = (position - a.position) / range
      return lerpHex(a.color, b.color, t)
    }
  }
  return sortedStops[0]!.color
}

function parseHexChannel(hex: string, offset: number): number {
  const parsed = parseInt(hex.slice(offset, offset + 2), 16)
  return Number.isNaN(parsed) ? 0 : parsed
}

function lerpHex(hex1: string, hex2: string, t: number): string {
  const r1 = parseHexChannel(hex1, 1)
  const g1 = parseHexChannel(hex1, 3)
  const b1 = parseHexChannel(hex1, 5)
  const r2 = parseHexChannel(hex2, 1)
  const g2 = parseHexChannel(hex2, 3)
  const b2 = parseHexChannel(hex2, 5)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── State hook ──────────────────────────────────────────────────────────

function resizeKeys(current: string[], nextLength: number): string[] {
  if (current.length === nextLength) return current
  if (current.length < nextLength) {
    return [
      ...current,
      ...Array.from({ length: nextLength - current.length }, () => nextStopId()),
    ]
  }
  return current.slice(0, nextLength)
}

function useGradientEditorState(
  value: LinearGradientValue,
  onChange: (v: LinearGradientValue) => void
) {
  const [keys, setKeys] = useState<string[]>(() => value.stops.map(() => nextStopId()))
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [editingStopColor, setEditingStopColor] = useState(false)

  // Clamp selection if the external value shrinks the stops array.
  const maxIndex = Math.max(0, value.stops.length - 1)
  const clampedSelected = Math.min(selectedIndex, maxIndex)

  // Zip current keys with stops; if the array length diverges (e.g. external reset),
  // synthesize placeholder keys. The effect below will replace them on the next tick.
  const stopsWithKeys: StopWithKey[] = value.stops.map((s, i) => ({
    ...s,
    key: keys[i] ?? `idx-${String(i)}`,
  }))

  const setKeysForLength = useCallback((length: number) => {
    setKeys((current) => resizeKeys(current, length))
  }, [])

  const emitChange = useCallback(
    (newStops: GradientStop[], newAngle?: number) => {
      setKeysForLength(newStops.length)
      onChange({ type: 'linear-gradient', angle: newAngle ?? value.angle, stops: newStops })
    },
    [onChange, value.angle, setKeysForLength]
  )

  return {
    stopsWithKeys,
    selectedIndex: clampedSelected,
    editingStopColor,
    setEditingStopColor,
    selectedStop: value.stops[clampedSelected],
    handleStopPositionChange: useCallback(
      (index: number, position: number) => {
        emitChange(value.stops.map((s, i) => (i === index ? { ...s, position } : s)))
      },
      [value.stops, emitChange]
    ),
    handleStopColorChange: useCallback(
      (color: string) => {
        emitChange(value.stops.map((s, i) => (i === clampedSelected ? { ...s, color } : s)))
      },
      [value.stops, clampedSelected, emitChange]
    ),
    handleAddStop: useCallback(
      (position: number, color: string) => {
        if (value.stops.length >= MAX_STOPS) return
        const newStops = [...value.stops, { color, position }]
        emitChange(newStops)
        setSelectedIndex(newStops.length - 1)
      },
      [value.stops, emitChange]
    ),
    handleRemoveStop: useCallback(
      (index: number) => {
        if (value.stops.length <= MIN_STOPS) return
        const newStops = value.stops.filter((_, i) => i !== index)
        emitChange(newStops)
        setSelectedIndex((prev) => Math.min(prev, newStops.length - 1))
      },
      [value.stops, emitChange]
    ),
    handleAngleChange: useCallback(
      (angle: number) => emitChange(value.stops, angle),
      [value.stops, emitChange]
    ),
    handleSelectStop: useCallback((index: number) => {
      setSelectedIndex(index)
      setEditingStopColor(true)
    }, []),
  }
}

// ── Main Component ──────────────────────────────────────────────────────

export const GradientEditor: React.FC<GradientEditorProps> = ({ value, onChange }) => {
  const state = useGradientEditorState(value, onChange)

  return (
    <div className="flex gap-0">
      <div className="flex flex-col gap-3 p-3 w-[240px] select-none text-text-primary">
        <GradientPreviewBar
          gradient={value}
          stops={state.stopsWithKeys}
          selectedIndex={state.selectedIndex}
          onSelectStop={state.handleSelectStop}
          onStopPositionChange={state.handleStopPositionChange}
          onAddStop={state.handleAddStop}
        />
        <StopList
          stops={state.stopsWithKeys}
          selectedIndex={state.selectedIndex}
          onSelectStop={state.handleSelectStop}
          onRemoveStop={state.handleRemoveStop}
          onStopPositionChange={state.handleStopPositionChange}
        />
        <AngleControl angle={value.angle} onChange={state.handleAngleChange} />
        {value.stops.length < MAX_STOPS && (
          <AddStopButton value={value} onAdd={state.handleAddStop} />
        )}
      </div>
      {state.editingStopColor && state.selectedStop != null && (
        <StopColorPanel
          index={state.selectedIndex}
          color={state.selectedStop.color}
          onChange={state.handleStopColorChange}
          onClose={() => state.setEditingStopColor(false)}
        />
      )}
    </div>
  )
}

function AddStopButton({
  value,
  onAdd,
}: {
  value: LinearGradientValue
  onAdd: (pos: number, color: string) => void
}) {
  return (
    <button
      onClick={() => {
        const sorted = value.stops.slice().sort((a, b) => a.position - b.position)
        const pos =
          sorted.length >= 2
            ? (sorted[sorted.length - 2]!.position + sorted[sorted.length - 1]!.position) / 2
            : 50
        onAdd(pos, interpolateColorAtPosition(sorted, pos))
      }}
      data-testid="gradient-add-stop"
      className="text-xs text-accent hover:text-accent/80 transition-colors self-start"
    >
      + Add color stop
    </button>
  )
}

function StopColorPanel({
  index,
  color,
  onChange,
  onClose,
}: {
  index: number
  color: string
  onChange: (c: string) => void
  onClose: () => void
}) {
  return (
    <div className="border-l border-border-subtle">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-xs text-text-tertiary font-medium">Stop {index + 1}</span>
        <button
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
}
