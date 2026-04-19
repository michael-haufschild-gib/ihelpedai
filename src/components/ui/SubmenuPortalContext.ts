import type { RefObject } from 'react'
import { createContext } from 'react'

/** Context providing the portal container for submenus inside a popover. */
export const SubmenuPortalContext = createContext<RefObject<HTMLDivElement | null> | null>(null)
