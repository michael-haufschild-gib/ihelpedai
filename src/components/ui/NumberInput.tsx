import { assertNever } from '@/utils/assertNever'
import React, { useEffect, useReducer, useRef } from 'react'
import { Input, type InputProps } from './Input'
import { m as MotionEl } from 'motion/react'

/** Props for the NumberInput component with expression evaluation support. */
export interface NumberInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
}

/**
 * Tokenizes a math expression into numbers, operators, and parentheses.
 */
function tokenize(expr: string): (string | number)[] | null {
  const tokens: (string | number)[] = []
  let i = 0

  while (i < expr.length) {
    const char = expr.charAt(i)

    if (/\s/.test(char)) {
      i++
      continue
    }

    if ('+-*/()%'.includes(char)) {
      tokens.push(char)
      i++
      continue
    }

    if (/[0-9.]/.test(char)) {
      let numStr = ''
      while (i < expr.length && /[0-9.]/.test(expr.charAt(i))) {
        numStr += expr.charAt(i)
        i++
      }
      const num = parseFloat(numStr)
      if (isNaN(num)) return null
      tokens.push(num)
      continue
    }

    return null
  }

  return tokens
}

/**
 * Safe recursive descent parser for math expressions.
 * Handles: +, -, *, /, %, parentheses, and unary minus.
 */
function parseTokens(tokens: (string | number)[]): number | null {
  let pos = 0

  function peek(): string | number | undefined {
    return tokens[pos]
  }

  function consume(): string | number | undefined {
    return tokens[pos++]
  }

  function parseExpr(): number | null {
    let left = parseTerm()
    if (left === null) return null

    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseTerm()
      if (right === null) return null
      left = op === '+' ? left + right : left - right
    }

    return left
  }

  function parseTerm(): number | null {
    let left = parseFactor()
    if (left === null) return null

    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume()
      const right = parseFactor()
      if (right === null) return null
      if (op === '*') left = left * right
      else if (op === '/') {
        if (right === 0) return null
        left = left / right
      } else left = left % right
    }

    return left
  }

  function parseFactor(): number | null {
    if (peek() === '-') {
      consume()
      const val = parsePrimary()
      if (val === null) return null
      return -val
    }
    if (peek() === '+') {
      consume()
    }
    return parsePrimary()
  }

  function parsePrimary(): number | null {
    const token = peek()

    if (typeof token === 'number') {
      consume()
      return token
    }

    if (token === '(') {
      consume()
      const result = parseExpr()
      if (result === null) return null
      if (peek() !== ')') return null
      consume()
      return result
    }

    return null
  }

  const result = parseExpr()

  if (pos !== tokens.length) return null

  return result
}

/**
 * Safely parses and evaluates a math expression without using eval().
 * Supports: numbers, +, -, *, /, %, parentheses, and constants (pi, tau, e).
 */
function parseExpression(expression: string): number | null {
  try {
    const expr = expression
      .replace(/\bpi\b/gi, Math.PI.toString())
      .replace(/\btau\b/gi, (Math.PI * 2).toString())
      .replace(/\be\b/gi, Math.E.toString())

    const tokens = tokenize(expr)
    if (!tokens || tokens.length === 0) return null

    const result = parseTokens(tokens)
    if (result === null || !isFinite(result) || isNaN(result)) return null

    return result
  } catch {
    return null
  }
}

function formatDisplayValue(value: number, precision: number): string {
  const formatted = value.toFixed(precision)
  return precision > 0 ? formatted.replace(/\.?0+$/, '') : formatted
}

interface NumberInputState {
  localValue: string
  error: string | null
  isFocused: boolean
}

type NumberInputAction =
  | { type: 'focus'; value: string }
  | { type: 'setLocalValue'; value: string }
  | { type: 'syncFromExternal'; value: string }
  | { type: 'commit'; value: string }
  | { type: 'reset'; value: string }
  | { type: 'showError'; error: string }

function numberInputReducer(state: NumberInputState, action: NumberInputAction): NumberInputState {
  switch (action.type) {
    case 'focus':
      return { ...state, isFocused: true, localValue: action.value, error: null }
    case 'setLocalValue':
      return { ...state, localValue: action.value, error: null }
    case 'syncFromExternal':
      if (state.isFocused || state.error !== null || state.localValue === action.value) {
        return state
      }
      return { ...state, localValue: action.value }
    case 'commit':
    case 'reset':
      return { localValue: action.value, error: null, isFocused: false }
    case 'showError':
      return { ...state, error: action.error, isFocused: false }
    default:
      return assertNever(action)
  }
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision = 3,
  onBlur,
  ...props
}) => {
  const [{ localValue, error }, dispatch] = useReducer(numberInputReducer, {
    localValue: formatDisplayValue(value, precision),
    error: null,
    isFocused: false,
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const errorTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (errorTimerRef.current !== null) {
        clearTimeout(errorTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    dispatch({ type: 'syncFromExternal', value: formatDisplayValue(value, precision) })
  }, [value, precision])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'setLocalValue', value: e.target.value })
  }

  const handleFocus = () => {
    dispatch({ type: 'focus', value: formatDisplayValue(value, precision) })
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseExpression(localValue)

    if (parsed !== null) {
      const clamped = Math.min(Math.max(parsed, min), max)
      onChange(clamped)
      dispatch({ type: 'commit', value: formatDisplayValue(clamped, precision) })
    } else {
      if (localValue.trim() === '') {
        dispatch({ type: 'reset', value: formatDisplayValue(value, precision) })
      } else {
        dispatch({ type: 'showError', error: 'Invalid expression' })
        if (errorTimerRef.current !== null) {
          clearTimeout(errorTimerRef.current)
        }
        errorTimerRef.current = window.setTimeout(() => {
          if (!isMountedRef.current) return
          dispatch({ type: 'reset', value: formatDisplayValue(value, precision) })
          errorTimerRef.current = null
        }, 1500)
      }
    }

    if (onBlur) onBlur(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
    props.onKeyDown?.(e)
  }

  return (
    <Input
      {...props}
      ref={inputRef}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      error={error || props.error}
      rightIcon={
        <div className="flex flex-col gap-px">
          <MotionEl.button
            data-testid="number-input-change"
            className="h-2 w-3 hover:bg-(--bg-active) rounded-sm flex items-center justify-center"
            onClick={() => {
              onChange(Math.min(value + step, max))
            }}
            tabIndex={-1}
          >
            <svg width="6" height="4" viewBox="0 0 8 4" fill="currentColor">
              <path d="M4 0L8 4H0L4 0Z" />
            </svg>
          </MotionEl.button>
          <MotionEl.button
            data-testid="number-input-change-2"
            className="h-2 w-3 hover:bg-(--bg-active) rounded-sm flex items-center justify-center"
            onClick={() => {
              onChange(Math.max(value - step, min))
            }}
            tabIndex={-1}
          >
            <svg width="6" height="4" viewBox="0 0 8 4" fill="currentColor">
              <path d="M4 4L0 0H8L4 4Z" />
            </svg>
          </MotionEl.button>
        </div>
      }
    />
  )
}
