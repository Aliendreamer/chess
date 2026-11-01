import { STANDARD_START, fromInput, isFen, studyLines, studyPgn, toInput } from '@chess/core'
import { newId } from './db'
import type { CommandOutcome, StudyInput, StudyMove, StudyMoveInput } from '@chess/core'
import type { ImportResult, StudyListItem, StudyView } from '@chess/ui'
import type { Db } from './db'

/**
 * Studies (studies D1–D3, desktop-app): rows in `studies` with the tree as JSON, the player's own. Every tree is
 * replayed before it is kept, so a tree with an illegal move is refused rather than cut; `version` makes a stale save
 * a 409. A save drops the trainer progress of lines the tree no longer has (study-repertoire-trainer D3).
 */

const OWNER = 'You'

interface StudyRow {
  id: string
  title: string
  start_fen: string
  tree: string
  white: string | null
  black: string | null
  result: string | null
  date: string | null
  version: number
  created_at: string
  updated_at: string
}

function view(row: StudyRow): StudyView {
  return {
    id: row.id,
    ownerId: 0,
    ownerName: OWNER,
    title: row.title,
    startFen: row.start_fen,
    tree: JSON.parse(row.tree) as Array<StudyMove>,
    white: row.white,
    black: row.black,
    result: row.result,
    date: row.date,
    shared: false,
    version: row.version,
    mine: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** A tree replayed from `startFen`, or why it cannot be kept. */
function replay(
  startFen: string,
  input: ReadonlyArray<StudyMoveInput>,
): { tree: Array<StudyMove> } | { error: string } {
  if (!isFen(startFen)) return { error: 'The start is not a legal position.' }
  const tree = fromInput(startFen, input)
  return JSON.stringify(toInput(tree)) === JSON.stringify(input)
    ? { tree }
    : { error: 'The moves include an illegal one.' }
}

export async function listStudies(db: Db): Promise<Array<StudyListItem>> {
  const rows = await db.select<StudyRow>('SELECT * FROM studies ORDER BY updated_at DESC, id DESC')
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    white: r.white,
    black: r.black,
    shared: false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function loadStudy(db: Db, id: string): Promise<StudyView | null> {
  const [row] = await db.select<StudyRow>('SELECT * FROM studies WHERE id = ?', [id])
  return row ? view(row) : null
}

/** Studies from an import (one per game) or New study; each is replayed, and the ones that do not replay are refused. */
export async function createStudies(
  db: Db,
  inputs: ReadonlyArray<StudyInput>,
  now = new Date(),
): Promise<ImportResult> {
  const created: ImportResult['created'] = []
  const refused: ImportResult['refused'] = []
  const statements = []
  for (const [index, input] of inputs.entries()) {
    const startFen = input.startFen ?? STANDARD_START
    const replayed = replay(startFen, input.tree)
    const title = input.title.trim().slice(0, 200) || 'Untitled study'
    if ('error' in replayed) {
      refused.push({ index, error: replayed.error })
      continue
    }
    const id = newId(now)
    const at = now.toISOString()
    statements.push({
      sql: `INSERT INTO studies (id, title, start_fen, tree, white, black, result, date, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      params: [
        id,
        title,
        startFen,
        JSON.stringify(replayed.tree),
        input.white ?? null,
        input.black ?? null,
        input.result ?? null,
        input.date ?? null,
        at,
        at,
      ],
    })
    created.push({ id, title })
  }
  await db.batch(statements)
  return { created, refused }
}

/** A save: refused when the study changed since it was read (`version`), or when the tree does not replay. */
export async function saveStudy(
  db: Db,
  change: { id: string; title: string; tree: ReadonlyArray<StudyMoveInput>; version: number },
  now = new Date(),
): Promise<CommandOutcome<StudyView>> {
  const study = await loadStudy(db, change.id)
  if (!study) return { ok: false, status: 404, error: 'There is no such study.' }
  if (study.version !== change.version)
    return {
      ok: false,
      status: 409,
      error: 'The study was changed since you opened it: reload it first.',
    }
  const replayed = replay(study.startFen, change.tree)
  if ('error' in replayed) return { ok: false, status: 422, error: replayed.error }
  const keep = new Set(
    (['white', 'black'] as const).flatMap((color) =>
      studyLines(study.startFen, replayed.tree, color).map((l) => l.key),
    ),
  )
  const kept = [...keep]
  await db.batch([
    {
      sql: 'UPDATE studies SET title = ?, tree = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
      params: [
        change.title.trim().slice(0, 200) || 'Untitled study',
        JSON.stringify(replayed.tree),
        now.toISOString(),
        change.id,
        change.version,
      ],
    },
    {
      sql: `DELETE FROM trainer_progress WHERE study_id = ?${kept.length > 0 ? ` AND line_key NOT IN (${kept.map(() => '?').join(', ')})` : ''}`,
      params: [change.id, ...kept],
    },
  ])
  return { ok: true, view: (await loadStudy(db, change.id))! }
}

/** The study as PGN with its variations (studies D3). */
export function studyAsPgn(study: StudyView): string {
  return studyPgn(
    study.title,
    { white: study.white, black: study.black, result: study.result, date: study.date },
    study.startFen,
    study.tree,
    'Chess desktop',
  )
}
