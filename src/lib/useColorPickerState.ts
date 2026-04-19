import { assertNever } from '@/utils/assertNever'
import { useState, useEffect, useCallback, useReducer } from 'react'
import {
  parseColorToHsv,
  hsvToHex,
  hsvToHex8,
  hsvToRgb,
  generatePalette,
  type HSVA,
  type RGBA,
} from '@/lib/colors/colorUtils'

const HISTORY_KEY = 'mdimension_color_history'
const MAX_HISTORY = 8

/** Options for the useColorPickerState hook. */
export interface UseColorPickerStateOptions {
  value: string
  onChange: (value: string) => void
  alpha?: number
  onChangeAlpha?: (alpha: number) => void
  disableAlpha: boolean
}

/** Return type for useColorPickerState. */
export interface ColorPickerState {
  hsv: HSVA
  mode: 'HEX' | 'RGB'
  setMode: (mode: 'HEX' | 'RGB') => void
  history: string[]
  addToHistory: (color: string) => void
  hexInput: string
  setHexInput: (v: string) => void
  rgbInput: RGBA
  setRgbInput: (v: RGBA) => void
  handleHsvChange: (hsv: HSVA) => void
  palette: string[]
}

interface ColorDraftState {
  history: string[]
  hsv: HSVA
  hexInput: string
  rgbInput: RGBA
}

type ColorDraftAction =
  | { type: 'loadHistory'; history: string[] }
  | { type: 'syncExternal'; next: Omit<ColorDraftState, 'history'> }
  | { type: 'setHexInput'; value: string }
  | { type: 'setRgbInput'; value: RGBA }
  | { type: 'setColor'; hsv: HSVA }

function buildColorDraft(value: string, alpha: number | undefined, disableAlpha: boolean) {
  const hsv = parseColorToHsv(value)
  if (disableAlpha) {
    hsv.a = 1
  } else if (alpha !== undefined) {
    hsv.a = alpha
  }

  return {
    hsv,
    hexInput: hsvToHex(hsv.h, hsv.s, hsv.v),
    rgbInput: hsvToRgb(hsv.h, hsv.s, hsv.v, hsv.a),
  }
}

function colorDraftReducer(state: ColorDraftState, action: ColorDraftAction): ColorDraftState {
  switch (action.type) {
    case 'loadHistory':
      return { ...state, history: action.history }
    case 'syncExternal':
      return { ...state, ...action.next }
    case 'setHexInput':
      return { ...state, hexInput: action.value }
    case 'setRgbInput':
      return { ...state, rgbInput: action.value }
    case 'setColor':
      return {
        ...state,
        hsv: action.hsv,
        hexInput: hsvToHex(action.hsv.h, action.hsv.s, action.hsv.v),
        rgbInput: hsvToRgb(action.hsv.h, action.hsv.s, action.hsv.v, action.hsv.a),
      }
    default:
      return assertNever(action)
  }
}

/**
 * Core state management for the ColorPicker.
 * Handles HSV state, color format sync, history persistence, and external change propagation.
 */
export function useColorPickerState(opts: UseColorPickerStateOptions): ColorPickerState {
  const [mode, setMode] = useState<'HEX' | 'RGB'>('HEX')
  const [state, dispatch] = useReducer(colorDraftReducer, {
    ...buildColorDraft(opts.value, opts.alpha, opts.disableAlpha),
    history: [],
  })

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) dispatch({ type: 'loadHistory', history: JSON.parse(stored) as string[] })
    } catch {
      // localStorage unavailable — history starts empty
    }
  }, [])

  const addToHistory = useCallback(
    (color: string) => {
      const filtered = state.history.filter((c) => c !== color)
      const next = [color, ...filtered].slice(0, MAX_HISTORY)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // localStorage unavailable
      }
      dispatch({ type: 'loadHistory', history: next })
    },
    [state.history]
  )

  useEffect(() => {
    dispatch({
      type: 'syncExternal',
      next: buildColorDraft(opts.value, opts.alpha, opts.disableAlpha),
    })
  }, [opts.value, opts.alpha, opts.disableAlpha])

  const {
    onChange: onChangeProp,
    onChangeAlpha: onChangeAlphaProp,
    disableAlpha: disableAlphaProp,
  } = opts

  const updateExternal = useCallback(
    (newHsv: HSVA) => {
      const h = { ...newHsv }
      if (disableAlphaProp) h.a = 1
      if (onChangeAlphaProp) {
        onChangeAlphaProp(h.a)
        onChangeProp(hsvToHex(h.h, h.s, h.v))
      } else {
        onChangeProp(h.a === 1 ? hsvToHex(h.h, h.s, h.v) : hsvToHex8(h.h, h.s, h.v, h.a))
      }
    },
    [onChangeProp, onChangeAlphaProp, disableAlphaProp]
  )

  const handleHsvChange = useCallback(
    (newHsv: HSVA) => {
      dispatch({ type: 'setColor', hsv: newHsv })
      updateExternal(newHsv)
    },
    [updateExternal]
  )

  const setHexInput = useCallback((value: string) => {
    dispatch({ type: 'setHexInput', value })
  }, [])

  const setRgbInput = useCallback((value: RGBA) => {
    dispatch({ type: 'setRgbInput', value })
  }, [])

  const palette = generatePalette(state.hsv.h, state.hsv.s, state.hsv.v)

  return {
    hsv: state.hsv,
    mode,
    setMode,
    history: state.history,
    addToHistory,
    hexInput: state.hexInput,
    setHexInput,
    rgbInput: state.rgbInput,
    setRgbInput,
    handleHsvChange,
    palette,
  }
}
