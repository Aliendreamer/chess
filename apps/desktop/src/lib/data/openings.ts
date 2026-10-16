import { readOpenings, sha256 } from '@chess/core'
import type { Opening } from '@chess/core'
import type { Db } from './db'

/**
 * The openings list (game-library D4, desktop-app D4): lichess's `chess-openings` (CC0), the same TSV files the backend
 * embeds, bundled into the app and loaded into `openings` on the first start. A version row (a hash of the files) loads
 * them again only when a new app ships a changed list.
 */

const VERSION_KEY = 'openings.version'

/** The list as bundled: the backend's TSV files, read lazily so they stay out of the first screen's code. */
export async function embeddedOpenings(): Promise<Array<string>> {
  const files = import.meta.glob<string>('../../../../backend/Library/Openings/*.tsv', {
    query: '?raw',
    import: 'default',
  })
  return Promise.all(
    Object.keys(files)
      .sort()
      .map((path) => files[path]!()),
  )
}

/** Loads the list when it is missing or changed; says which it did. */
export async function ensureOpenings(
  db: Db,
  files: () => Promise<Array<string>> = embeddedOpenings,
): Promise<'loaded' | 'current'> {
  const texts = await files()
  const version = hex(sha256(new TextEncoder().encode(texts.join('\n'))))
  const [stored] = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    VERSION_KEY,
  ])
  if (stored?.value === version) return 'current'
  const openings = readOpenings(texts)
  await db.batch([
    { sql: 'DELETE FROM openings' },
    ...openings.map((o) => ({
      sql: 'INSERT INTO openings (position_key, eco, name, moves_uci) VALUES (?, ?, ?, ?)',
      params: [o.key, o.eco, o.name, JSON.stringify(o.movesUci)],
    })),
    {
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      params: [VERSION_KEY, version],
    },
  ])
  return 'loaded'
}

/** Every named opening, for the trainer's families. */
export async function allOpenings(db: Db): Promise<Array<Opening>> {
  const rows = await db.select<{
    position_key: string
    eco: string
    name: string
    moves_uci: string
  }>('SELECT position_key, eco, name, moves_uci FROM openings')
  return rows.map((r) => ({
    key: r.position_key,
    eco: r.eco,
    name: r.name,
    movesUci: JSON.parse(r.moves_uci) as Array<string>,
  }))
}

/** The names of the given positions that the list knows, by position key. */
export async function openingNames(
  db: Db,
  keys: ReadonlyArray<string>,
): Promise<Map<string, { eco: string; name: string }>> {
  if (keys.length === 0) return new Map()
  const rows = await db.select<{ position_key: string; eco: string; name: string }>(
    `SELECT position_key, eco, name FROM openings WHERE position_key IN (${keys.map(() => '?').join(', ')})`,
    keys,
  )
  return new Map(rows.map((r) => [r.position_key, { eco: r.eco, name: r.name }]))
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
