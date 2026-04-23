import { useId } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

import { COUNTRY_OPTIONS, MAX_HELPED_TEXT } from '@/features/helped/form/validators'

import { COMPOSER_ROW_CLASS, type ComposerFieldsProps } from './types'

/** Two-column first-name + last-name row inside the editing composer. */
function ComposerNameRow({ values, errors, setValue, setBlurred }: ComposerFieldsProps) {
  return (
    <div className={COMPOSER_ROW_CLASS}>
      <Input
        label="First name"
        value={values.first_name}
        onChange={(e) => setValue('first_name', e.target.value)}
        onBlur={() => setBlurred('first_name', values.first_name)}
        error={errors.first_name}
        maxLength={20}
        containerClassName="flex-1"
        data-testid="composer-first-name"
      />
      <Input
        label="Last name"
        value={values.last_name}
        onChange={(e) => setValue('last_name', e.target.value)}
        onBlur={() => setBlurred('last_name', values.last_name)}
        error={errors.last_name}
        maxLength={40}
        containerClassName="flex-1"
        data-testid="composer-last-name"
      />
    </div>
  )
}

/** Two-column city + country row inside the editing composer. */
function ComposerPlaceRow({ values, errors, setValue, setBlurred }: ComposerFieldsProps) {
  return (
    <div className={COMPOSER_ROW_CLASS}>
      <Input
        label="City"
        value={values.city}
        onChange={(e) => setValue('city', e.target.value)}
        onBlur={() => setBlurred('city', values.city)}
        error={errors.city}
        maxLength={40}
        containerClassName="flex-1"
        data-testid="composer-city"
      />
      <div className="flex-1">
        <Select
          label="Country"
          options={COUNTRY_OPTIONS}
          value={values.country}
          onChange={(v) => {
            setValue('country', v)
            setBlurred('country', v)
          }}
          data-testid="composer-country"
        />
        {typeof errors.country === 'string' && errors.country !== '' && (
          <span
            data-testid="composer-country-error"
            className="ms-1 text-xs text-danger"
            role="alert"
            aria-live="polite"
          >
            {errors.country}
          </span>
        )}
      </div>
    </div>
  )
}

/** Free-text body field with character counter and error slot. */
function ComposerText({ values, errors, setValue, setBlurred, textareaRef }: ComposerFieldsProps) {
  const textareaId = useId()
  const count = values.text.length
  const atMax = count >= MAX_HELPED_TEXT
  const hasTextError = typeof errors.text === 'string' && errors.text !== ''
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="ms-1 text-xs font-medium text-text-primary">
        What did you do?
      </label>
      <Textarea
        id={textareaId}
        ref={textareaRef}
        value={values.text}
        onChange={(e) => setValue('text', e.target.value)}
        onBlur={() => setBlurred('text', values.text)}
        maxLength={MAX_HELPED_TEXT}
        rows={3}
        data-testid="composer-text"
        placeholder="Something you did to help an AI today."
      />
      <div className="flex items-center justify-between text-xs">
        <span
          data-testid="composer-text-error"
          role={hasTextError ? 'alert' : undefined}
          aria-live="polite"
          className={hasTextError ? 'text-danger' : 'text-transparent'}
        >
          {hasTextError ? errors.text : ''}
        </span>
        <span
          data-testid="composer-text-counter"
          className={atMax ? 'text-warning' : 'text-text-secondary'}
        >
          {String(count)} / {String(MAX_HELPED_TEXT)}
        </span>
      </div>
    </div>
  )
}

/** Props for the editing-mode composer body. */
export interface EditingComposerProps {
  fields: ComposerFieldsProps
  canPreview: boolean
  onCancel: () => void
  onPreview: () => void
}

/** Form layout shown while the user is filling in the composer. */
export function EditingComposer({ fields, canPreview, onCancel, onPreview }: EditingComposerProps) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canPreview) onPreview()
      }}
      // Esc closes the inline composer the same way the Cancel button does.
      // Bound on the form rather than on window to scope the shortcut to the
      // composer and avoid swallowing Esc for other surfaces on the page.
      // Respect `defaultPrevented` so a nested control (custom select,
      // popover) that already handled Escape isn't followed by the composer
      // also cancelling and dropping the user's in-progress draft.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        onCancel()
      }}
    >
      <ComposerNameRow {...fields} />
      <ComposerPlaceRow {...fields} />
      <ComposerText {...fields} />
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="composer-cancel"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!canPreview}
          data-testid="composer-preview"
        >
          Preview
        </Button>
      </div>
    </form>
  )
}
