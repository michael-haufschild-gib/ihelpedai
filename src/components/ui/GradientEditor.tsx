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
import { GradientStopColorPanel } from './GradientStopColorPanel'
import { toCssGradientString, nextStopId } from '@/lib/colors/gradientUtils'
import { interpolateColorAtPosition } from '@/lib/colors/gradientInterpolation'
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

function getKeyboardDelta(key: string, shift: boolean, alt: boolean): number | 'home' | 'end' | null {
  if (key === 'Home') return 'home'
  if (key === 'End') return 'end'
  const step = shift ? 10 : alt ? 0.1 : 1
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -step
  if (key === 'ArrowRight' || key === 'ArrowUp') return step
  return null
}

function useMarkerHandlers(
  stopPosition: number,
  barRef: React.RefObject<HTMLDivElement | null>,
  onSelect: () => void,
  onPositionChange: (position: number) => void
) {
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
      startPosRef.current = stopPosition
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [onSelect, stopPosition]
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect()
        return
      }
      const action = getKeyboardDelta(e.key, e.shiftKey, e.altKey)
      if (action === null) return
      e.preventDefault()
      onSelect()
      if (action === 'home') onPositionChange(0)
      else if (action === 'end') onPositionChange(100)
      else {
        const next = Math.max(0, Math.min(100, stopPosition + action))
        onPositionChange(Math.round(next * 10) / 10)
      }
    },
    [onSelect, onPositionChange, stopPosition]
  )

  return { handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown }
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
  const { handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown } =
    useMarkerHandlers(stop.position, barRef, onSelect, onPositionChange)
  const rounded = Math.round(stop.position)

  return (
    <div
      data-gradient-marker
      data-testid={`gradient-marker-${String(index)}`}
      role="slider"
      tabIndex={0}
      aria-label={`Gradient stop ${index + 1}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      aria-valuetext={`${String(rounded)}%`}
      aria-orientation="horizontal"
      className={`absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:rounded-full ${isSelected ? 'z-20' : 'z-10'}`}
      style={sx({
        left: `calc(${String(stop.position)}% - ${String(MARKER_HIT_SIZE / 2)}px)`,
        width: `${String(MARKER_HIT_SIZE)}px`,
        height: `${String(MARKER_HIT_SIZE)}px`,
      })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
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
              type="button"
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

  // Clamp selection if the external value shrinks the stops array. This covers
  // controlled reset/undo and preset switches: a smaller stops array always wins
  // over a stale index, and stopsWithKeys below derives straight from value.stops
  // so the markers render the current data.
  const maxIndex = Math.max(0, value.stops.length - 1)
  const clampedSelected = Math.min(selectedIndex, maxIndex)

  // Zip current keys with stops. When the external value grows the array (or
  // was replaced by a longer preset) the extra indices fall back to a positional
  // placeholder key; emitChange below re-syncs stable keys on the next internal
  // update. Extra trailing keys (external shrink) are simply ignored by .map.
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
        <GradientStopColorPanel
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
      type="button"
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

