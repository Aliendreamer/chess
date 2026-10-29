/**
 * The window's size on demand (the rail's − / + / Fit screen): pure steps, so they are tested without a window. The
 * shell's own controls are not enough everywhere (WSLg's title bar has only a close button).
 */

export type WindowChange = 'grow' | 'shrink'

export interface Size {
  width: number
  height: number
}

/** Each − or + changes the window by this much. */
export const WINDOW_STEP = 1.1

/** The smallest window the pages are laid out for (also `minWidth`/`minHeight` in `tauri.conf.json`). */
export const MIN_WINDOW: Size = { width: 800, height: 600 }

/** The next size: 10% larger or smaller, never below `min` nor beyond the screen (`max`). */
export function nextWindowSize(
  current: Size,
  change: WindowChange,
  max: Size,
  min = MIN_WINDOW,
): Size {
  const factor = change === 'grow' ? WINDOW_STEP : 1 / WINDOW_STEP
  const clamp = (value: number, low: number, high: number) =>
    Math.round(Math.min(Math.max(value, low), Math.max(low, high)))
  return {
    width: clamp(current.width * factor, min.width, max.width),
    height: clamp(current.height * factor, min.height, max.height),
  }
}
