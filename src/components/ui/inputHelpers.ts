import type React from 'react'

/** Fires a synthetic change event on an input to clear its value. */
export function clearInputValue(
  input: HTMLInputElement,
  onChange?: React.ChangeEventHandler<HTMLInputElement>,
  onClear?: () => void
) {
  input.value = ''
  if (onChange) {
    const syntheticEvent = {
      target: input,
      currentTarget: input,
      nativeEvent: new Event('input', { bubbles: true }),
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: true,
      preventDefault: () => {},
      stopPropagation: () => {},
      persist: () => {},
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      timeStamp: Date.now(),
      type: 'change',
    } as unknown as React.ChangeEvent<HTMLInputElement>
    onChange(syntheticEvent)
  } else {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  input.focus()
  onClear?.()
}
