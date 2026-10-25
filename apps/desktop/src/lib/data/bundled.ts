import { prepareImport, sha256 } from '@chess/core'
import { gameStatements } from './library'
import type { Db, Statement } from './db'

/**
 * The bundled library (desktop-app D12): the club's library as the app ships it — the World Championship matches
 * (PGN Mentor, moves only) and the lichess broadcast games (CC BY-SA 4.0), with every position the club's Stockfish has
 * judged for training and the critical ones it kept — written by `tools/desktop/export-library.mjs` into
 * `library/library.json.gz`. It is loaded on the first start and again only when a new app ships a changed file, and
 * it only ever adds: a game the player already has is kept (the bundled training points at their copy), and nothing
 * of the player's — games, progress — is removed or changed.
 */

const VERSION_KEY = 'library.bundled.version'
/** Games per transaction: the load runs behind the first screen, so it yields between batches. */
const GAMES_PER_BATCH = 50

export interface BundledGame {
  id: string
  white: string
  black: string
  event: string | null
  site: string | null
  round: string | null
  date: string | null
  result: string
  eco: string | null
  /** UCI, space-separated. */
  moves: string
  /** The key of every position from the start, computed by the export: the load stores them without a replay. */
  keys: Array<string>
  source: string
  licence: string
  sourceRef: string | null
}

/** A position the club's miner judged: critical ones became training positions, quiet ones are never asked again. */
export interface BundledCandidate {
  key: string
  gameId: string
  ply: number
  fen: string
  next: string
  critical: boolean
  judgedAt: string
}

export interface BundledPosition {
  id: string
  key: string
  fen: string
  master: string
  accepted: Array<string>
  line: Array<string>
  gap: number
  phase: 'middlegame' | 'endgame'
  eco: string | null
  opening: string | null
  white: string
  black: string
  event: string | null
  year: number | null
  gameId: string
  ply: number
  createdAt: string
}

export interface BundledLibrary {
  format: 1
  games: Array<BundledGame>
  candidates: Array<BundledCandidate>
  positions: Array<BundledPosition>
}

/** The file as shipped, gzipped; fetched lazily so it stays out of the first screen's code. */
export async function embeddedLibrary(): Promise<Uint8Array<ArrayBuffer>> {
  const { default: url } = await import('../../../library/library.json.gz?url')
  return new Uint8Array(await (await fetch(url)).arrayBuffer())
}

/** Loads the bundled library when it is missing or changed; says which, and how many games it added. */
export async function ensureBundledLibrary(
  db: Db,
  file: () => Promise<Uint8Array<ArrayBuffer>> = embeddedLibrary,
  now = new Date(),
): Promise<{ state: 'loaded' | 'current'; games: number }> {
  const bytes = await file()
  const version = hex(sha256(bytes))
  const [stored] = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    VERSION_KEY,
  ])
  if (stored?.value === version) return { state: 'current', games: 0 }
  const library = JSON.parse(await gunzip(bytes)) as BundledLibrary

  const openingRows = await db.select<{ position_key: string; eco: string; name: string }>(
    'SELECT position_key, eco, name FROM openings',
  )
  const openings = new Map(openingRows.map((o) => [o.position_key, { eco: o.eco, name: o.name }]))
  // Bundled id → the id the game has here: its own, or that of the player's copy with the same dedupe key.
  const ids = new Map<string, string>()
  const byKey = new Map(
    (
      await db.select<{ id: string; dedupe_key: string }>(
        'SELECT id, dedupe_key FROM library_games',
      )
    ).map((r) => [r.dedupe_key, r.id]),
  )
  let added = 0
  let batch: Array<Statement> = []
  let inBatch = 0
  const flush = async () => {
    if (batch.length) await db.batch(batch)
    batch = []
    inBatch = 0
    // Let the window paint and the player act between batches.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  for (const g of library.games) {
    const prepared = prepareImport(
      { ...g, moves: g.moves.split(' ').filter(Boolean), startFen: null },
      { source: g.source, licence: g.licence, sourceRef: g.sourceRef },
      openings,
      g.id,
      g.keys,
    )
    if (!prepared.ok) continue
    const existing = byKey.get(prepared.game.dedupeKey)
    if (existing) {
      ids.set(g.id, existing)
      continue
    }
    byKey.set(prepared.game.dedupeKey, g.id)
    ids.set(g.id, g.id)
    batch.push(...gameStatements(prepared.game, prepared.positions, now))
    added++
    if (++inBatch === GAMES_PER_BATCH) await flush()
  }
  await flush()

  const trainingStatements: Array<Statement> = []
  for (const c of library.candidates) {
    const gameId = ids.get(c.gameId)
    if (!gameId) continue
    trainingStatements.push({
      sql: `INSERT INTO training_candidates (position_key, game_id, ply, fen, next_uci, asked_at, judged_at, critical)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      params: [c.key, gameId, c.ply, c.fen, c.next, c.judgedAt, c.judgedAt, c.critical ? 1 : 0],
    })
  }
  for (const p of library.positions) {
    const gameId = ids.get(p.gameId)
    if (!gameId) continue
    trainingStatements.push({
      sql: `INSERT INTO training_positions (id, position_key, fen, master_uci, accepted_uci, best_line, gap, phase, eco,
            opening_name, white, black, event, year, library_game_id, ply, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      params: [
        p.id,
        p.key,
        p.fen,
        p.master,
        JSON.stringify(p.accepted),
        JSON.stringify(p.line),
        p.gap,
        p.phase,
        p.eco,
        p.opening,
        p.white,
        p.black,
        p.event,
        p.year,
        gameId,
        p.ply,
        p.createdAt,
      ],
    })
  }
  // The version last: a load cut short (the app closed) runs again, and what it already stored is skipped.
  await db.batch([
    ...trainingStatements,
    {
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      params: [VERSION_KEY, version],
    },
  ])
  return { state: 'loaded', games: added }
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
