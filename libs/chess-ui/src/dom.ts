import {
  REVIEW_POLL_MS,
  useMoveTree as useMoveTreeWith,
  useReview as useReviewWith,
} from '@chess/view'
import type { MoveTreeEditor, MoveTreeKey, MoveTreeKeys, ReviewView } from '@chess/view'
import type { CommandOutcome, StudyMove, TreePath } from '@chess/core'

/**
 * `@chess/view`'s hooks with the browser's keys and visibility (mobile-app D1): what the club and the desktop app use,
 * under the same names, so their pages do not change.
 */

const KEYS: Partial<Record<string, MoveTreeKey>> = {
  ArrowLeft: 'back',
  ArrowRight: 'forward',
  Home: 'start',
  End: 'end',
  f: 'flip',
}

/** ← → Home End and `f` on the window, except while typing in a field. */
export const domKeys: MoveTreeKeys = (onKey) => {
  const listener = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const key = KEYS[e.key]
    if (!key) return
    e.preventDefault()
    onKey(key)
  }
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
}

/** Whether the tab is on screen. */
export const tabVisible = (): boolean => document.visibilityState === 'visible'

export function useMoveTree(
  initialStart: string,
  initialTree: Array<StudyMove>,
  initialPath: TreePath = [],
): MoveTreeEditor {
  return useMoveTreeWith(initialStart, initialTree, initialPath, domKeys)
}

export function useReview(
  initial: ReviewView | null,
  load: () => Promise<ReviewView | null>,
  start: () => Promise<CommandOutcome<ReviewView>>,
  pollMs = REVIEW_POLL_MS,
  enabled = true,
): ReturnType<typeof useReviewWith> {
  return useReviewWith(initial, load, start, pollMs, enabled, tabVisible)
}
