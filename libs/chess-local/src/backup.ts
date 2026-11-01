import { MIGRATIONS, literal, schemaVersion } from './db'
import type { CommandOutcome } from '@chess/core'
import type { Db, Sql } from './db'

/**
 * Backup and restore (desktop-app D10): a backup is the whole database copied with `VACUUM INTO` (consistent while the
 * app runs). A restore takes a file only when it is one of this app's (its marker row) and not from a newer version,
 * keeps the current data aside, then replaces every table's rows with the backup's in one transaction, the backup
 * attached on the same connection. The openings stay as this app ships them.
 */

export const MARKER_KEY = 'app.marker'
export const MARKER = '"chess-desktop"'

/** Children before their parents: the order rows are deleted in (and inserted in reverse). */
const TABLES = [
  'training_progress',
  'training_positions',
  'training_candidates',
  'library_positions',
  'mistake_drills',
  'reviews',
  'moves',
  'trainer_progress',
  'library_games',
  'studies',
  'games',
  'position_evaluations',
  'news_items',
  'chess_events',
  'settings',
] as const

export async function backupTo(db: Db, path: string): Promise<void> {
  await db.script(`VACUUM INTO ${literal(path)}`)
}

/** Whether a database (opened on its own) is a backup this app can restore. */
export async function checkBackup(
  other: Sql,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let marker: Array<{ value: string }>
  try {
    marker = await other.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
      MARKER_KEY,
    ])
  } catch {
    return { ok: false, error: 'That file is not a backup of this app.' }
  }
  if (marker[0]?.value !== MARKER)
    return { ok: false, error: 'That file is not a backup of this app.' }
  const version = await schemaVersion(other)
  if (version > MIGRATIONS.length)
    return {
      ok: false,
      error: 'That backup was made by a newer version of the app: update the app first.',
    }
  if (version < MIGRATIONS.length)
    return { ok: false, error: 'That backup was made by an older version of the app.' }
  return { ok: true }
}

/**
 * Replaces the data with a checked backup's; the current data is first copied to `asideTo`. Nothing changes when the
 * backup is refused or the copy fails.
 */
export async function restoreFrom(
  db: Db,
  backup: { path: string; open: () => Promise<Sql & { close?: () => Promise<void> | void }> },
  asideTo: string,
): Promise<CommandOutcome<true>> {
  const other = await backup.open()
  let checked
  try {
    checked = await checkBackup(other)
  } finally {
    await other.close?.()
  }
  if (!checked.ok) return { ok: false, status: 422, error: checked.error }
  await backupTo(db, asideTo)
  const restore = [
    `ATTACH DATABASE ${literal(backup.path)} AS backup`,
    'BEGIN IMMEDIATE',
    ...TABLES.map((t) =>
      t === 'settings'
        ? "DELETE FROM main.settings WHERE key NOT LIKE 'openings.%'"
        : `DELETE FROM main.${t}`,
    ),
    ...[...TABLES]
      .reverse()
      .map((t) =>
        t === 'settings'
          ? "INSERT OR REPLACE INTO main.settings SELECT * FROM backup.settings WHERE key NOT LIKE 'openings.%'"
          : `INSERT INTO main.${t} SELECT * FROM backup.${t}`,
      ),
    'COMMIT',
    'DETACH DATABASE backup',
  ]
  try {
    await db.script(restore.map((s) => `${s};`).join('\n'))
  } catch (e) {
    await db.script('ROLLBACK').catch(() => undefined)
    await db.script('DETACH DATABASE backup').catch(() => undefined)
    throw e
  }
  return { ok: true, view: true }
}
