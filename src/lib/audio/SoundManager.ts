/**
 * SoundManager stub — no-op implementation for UI components.
 * Components import soundManager.playClick(), playHover(), etc.
 */

const noop = () => {}

export const soundManager = {
  playClick: noop,
  playHover: noop,
  playSwish: noop,
  playSnap: noop,
  playSuccess: noop,
  playError: noop,
}
