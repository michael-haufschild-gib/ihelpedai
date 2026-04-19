import { createContext } from 'react'

/**
 * Context providing the portal container element for submenus inside a popover.
 * Value is the DOM element itself (or null before it mounts), not a ref — so
 * consumers can read it during render without violating the refs-in-render rule.
 */
export const SubmenuPortalContext = createContext<HTMLDivElement | null>(null)
