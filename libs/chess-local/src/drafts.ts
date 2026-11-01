import { fromInput, toInput } from '@chess/core'
import { getSetting, setSetting } from './settings.ts'
import type { StudyMove, StudyMoveInput, TreePath } from '@chess/core'
import type { Db } from './db.ts'

/**
 * Drafts (mobile-app D13): what the player is working on but has not saved, kept as it changes, so that the app closing
 * (a Stockfish crash on the phone, the system killing it) loses nothing. The analysis board has one draft, each study
 * one for unsaved edits. Kept in `settings` as moves (`toInput`), rebuilt with their positions when read.
 */

export const DRAFTS = {
  analysis: 'draft.analysis',
  study: (id: string) => `draft.study.${id}`,
} as const

/** The analysis board as the player left it. */
export interface BoardDraft {
  startFen: string
  tree: Array<StudyMove>
  path: TreePath
  players?: { white: string; black: string }
}

/** A study's unsaved edit, made on `version` (a draft for an older version is stale). */
export interface StudyDraft extends BoardDraft {
  title: string
  version: number
}

interface Stored {
  startFen: string
  moves: Array<StudyMoveInput>
  path: Array<number>
  players?: { white: string; black: string }
  title?: string
  version?: number
}

export async function loadBoardDraft(db: Db): Promise<BoardDraft | null> {
  const stored = await getSetting<Stored | null>(db, DRAFTS.analysis, null)
  return stored ? board(stored) : null
}

/** The study's unsaved edit when it was made on `version`; a stale one is dropped. */
export async function loadStudyDraft(
  db: Db,
  id: string,
  version: number,
): Promise<StudyDraft | null> {
  const stored = await getSetting<Stored | null>(db, DRAFTS.study(id), null)
  if (!stored) return null
  if (stored.version !== version || stored.title === undefined) {
    await clearDraft(db, DRAFTS.study(id))
    return null
  }
  return { ...board(stored), title: stored.title, version }
}

export async function clearDraft(db: Db, key: string): Promise<void> {
  await db.execute('DELETE FROM settings WHERE key = ?', [key])
}

/**
 * Writes a draft once changes settle (`ms` after the last one); `flush` writes what is pending now, `clear` drops it and
 * removes the stored draft (after a save).
 */
export function draftWriter<T extends BoardDraft | StudyDraft>(
  db: Db,
  key: string,
  ms = 500,
): { write: (draft: T) => void; flush: () => Promise<void>; clear: () => Promise<void> } {
  let pending: T | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = async () => {
    if (timer) clearTimeout(timer)
    timer = null
    const draft = pending
    pending = null
    if (draft) await setSetting(db, key, stored(draft))
  }
  return {
    write: (draft) => {
      pending = draft
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void flush().catch(() => undefined), ms)
    },
    flush,
    clear: async () => {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
      await clearDraft(db, key)
    },
  }
}

function stored(draft: BoardDraft | StudyDraft): Stored {
  return {
    startFen: draft.startFen,
    moves: toInput(draft.tree),
    path: [...draft.path],
    ...(draft.players ? { players: draft.players } : {}),
    ...('title' in draft ? { title: draft.title, version: draft.version } : {}),
  }
}

function board(s: Stored): BoardDraft {
  return {
    startFen: s.startFen,
    tree: fromInput(s.startFen, s.moves),
    path: s.path,
    ...(s.players ? { players: s.players } : {}),
  }
}
