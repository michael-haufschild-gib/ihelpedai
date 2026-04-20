import { domAnimation } from 'motion/react'

/**
 * Motion feature bundle loaded lazily by `<LazyMotion>` in `main.tsx`.
 * `domAnimation` enables animations, variants, exit/layout — which is
 * all the site currently uses. Upgrade to `domMax` only if a component
 * needs drag or advanced layout transforms.
 */
export const features = domAnimation
