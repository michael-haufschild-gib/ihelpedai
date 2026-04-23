import type React from 'react'

import type {
  HelpedFieldName,
  HelpedFormValues,
} from '@/features/helped/form/validators'

/** The four lifecycle modes the composer can be in. */
export type ComposerMode = 'closed' | 'editing' | 'previewing' | 'posted'

/** Field-row props shared by every editing-mode subcomponent. */
export interface ComposerFieldsProps {
  values: HelpedFormValues
  errors: Partial<Record<HelpedFieldName, string>>
  setValue: (name: HelpedFieldName, value: string) => void
  setBlurred: (name: HelpedFieldName, value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

/** Row class applied to every paired-field row inside the composer. */
export const COMPOSER_ROW_CLASS = 'flex flex-col gap-3 sm:flex-row'
