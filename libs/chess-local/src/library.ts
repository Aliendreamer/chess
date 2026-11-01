import { Chess } from 'chess.js'
import { parsePgn, positionKey, prepareImport, toImportGame } from '@chess/core'
import { newId } from './db'
import { openingNames } from './openings'
import type { LibraryGame, LibraryGamePosition, ParsedGame } from '@chess/core'
import type { ExplorerMove, LibraryGameItem, LibraryGameView, LibraryPosition } from '@chess/ui'
import type { Db, Statement } from './db'

/**
 * The game library (game-library, library-explorer, desktop-app): the PGN collections the player imports — moves and
 * factual headers only, each game replayed from the start (an illegal one refused, a duplicate skipped by its dedupe
 * key) and every position it reached kept with the move played there, so the explorer counts in SQL.
 */

export const YOUR_IMPORT = 'your import'

export interface LibraryImportReport {
  imported: number
  duplicates: number
  /** The games that were not read or were refused, by their number in the file. */
  refused: Array<{ index: number; error: string }>
}

interface GameRow {
  id: string
  white: string
  black: string
  event: string | null
  site: string | null
  round: string | null
  date_text: string | null
  year: number | null
  result: string
  eco: string | null
  opening_name: string | null
  ply: number
  source: string
  licence: string
  source_ref: string | null
  moves_uci: string
}

/** Imports a PGN file: every game it reads into the library, a game already there skipped. */
export async function importLibrary(
  db: Db,
  pgn: string,
  file: string | null,
  now = new Date(),
): Promise<LibraryImportReport> {
  const parsed = parsePgn(pgn)
  const openingRows = await db.select<{ position_key: string; eco: string; name: string }>(
    'SELECT position_key, eco, name FROM openings',
  )
  const openings = new Map(openingRows.map((o) => [o.position_key, { eco: o.eco, name: o.name }]))
  const existing = new Set(
    (await db.select<{ dedupe_key: string }>('SELECT dedupe_key FROM library_games')).map(
      (r) => r.dedupe_key,
    ),
  )
  const report: LibraryImportReport = { imported: 0, duplicates: 0, refused: [] }
  for (const [index, game] of parsed.entries()) {
    if (!game.ok) {
      report.refused.push({ index: index + 1, error: game.error })
      continue
    }
    const prepared = prepareImport(
      toImportGame(game),
      { source: YOUR_IMPORT, licence: 'imported by you', sourceRef: file },
      openings,
      newId(now),
    )
    if (!prepared.ok) {
      report.refused.push({ index: index + 1, error: prepared.error })
      continue
    }
    if (existing.has(prepared.game.dedupeKey)) {
      report.duplicates++
      continue
    }
    existing.add(prepared.game.dedupeKey)
    await db.batch(gameStatements(prepared.game, prepared.positions, now))
    report.imported++
  }
  return report
}

/** The writes that store a prepared game and every position it reached. */
export function gameStatements(
  g: LibraryGame,
  positions: ReadonlyArray<LibraryGamePosition>,
  now: Date,
): Array<Statement> {
  return [
    {
      sql: `INSERT INTO library_games (id, white, black, event, site, round, date_text, year, result, eco, opening_name,
            moves_uci, ply, source, licence, source_ref, dedupe_key, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        g.id,
        g.white,
        g.black,
        g.event,
        g.site,
        g.round,
        g.dateText,
        g.year,
        g.result,
        g.eco,
        g.openingName,
        JSON.stringify(g.movesUci),
        g.ply,
        g.source,
        g.licence,
        g.sourceRef,
        g.dedupeKey,
        now.toISOString(),
      ],
    },
    ...positions.map((p) => ({
      sql: 'INSERT INTO library_positions (game_id, ply, position_key, next_uci, result, source) VALUES (?, ?, ?, ?, ?, ?)',
      params: [p.gameId, p.ply, p.positionKey, p.nextUci, p.result, p.source],
    })),
  ]
}

function item(r: GameRow): LibraryGameItem {
  return {
    id: r.id,
    white: r.white,
    black: r.black,
    event: r.event,
    site: r.site,
    round: r.round,
    date: r.date_text,
    year: r.year,
    result: r.result,
    eco: r.eco,
    opening: r.opening_name,
    worldChampionship: false,
    ply: r.ply,
    source: r.source,
    licence: r.licence,
  }
}

export interface LibraryQuery {
  player?: string
  event?: string
  from?: number
  to?: number
}

const like = (text: string) => `%${text.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`

/** Games by part of a player's or the event's name and by years, newest first. */
export async function searchLibrary(
  db: Db,
  query: LibraryQuery,
  limit = 50,
): Promise<Array<LibraryGameItem>> {
  const where: Array<string> = []
  const params: Array<string | number> = []
  if (query.player?.trim()) {
    where.push("(white LIKE ? ESCAPE '\\' OR black LIKE ? ESCAPE '\\')")
    params.push(like(query.player), like(query.player))
  }
  if (query.event?.trim()) {
    where.push("event LIKE ? ESCAPE '\\'")
    params.push(like(query.event))
  }
  if (query.from !== undefined) {
    where.push('year >= ?')
    params.push(query.from)
  }
  if (query.to !== undefined) {
    where.push('year <= ?')
    params.push(query.to)
  }
  const rows = await db.select<GameRow>(
    `SELECT * FROM library_games ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY year DESC, white, id LIMIT ?`,
    [...params, limit],
  )
  return rows.map(item)
}

export async function libraryGame(db: Db, id: string): Promise<LibraryGameView | null> {
  const [row] = await db.select<GameRow>('SELECT * FROM library_games WHERE id = ?', [id])
  return row
    ? {
        game: item(row),
        moves: JSON.parse(row.moves_uci) as Array<string>,
        sourceRef: row.source_ref,
      }
    : null
}

export async function libraryCount(db: Db): Promise<number> {
  const [row] = await db.select<{ n: number }>('SELECT count(*) AS n FROM library_games')
  return row?.n ?? 0
}

/**
 * The library at a position (library-explorer): its games (each counted once, at its first visit), White/draw/Black,
 * the next move of every game with its results and the opening it reaches, most played first, and a few of the games.
 */
export async function libraryPosition(db: Db, fen: string, items = 20): Promise<LibraryPosition> {
  const key = positionKey(fen)
  const first = `WITH first AS (
      SELECT game_id, MIN(ply) AS ply FROM library_positions WHERE position_key = ? GROUP BY game_id
    )`
  const rows = await db.select<{ next_uci: string | null; result: string; n: number }>(
    `${first} SELECT lp.next_uci, lp.result, count(*) AS n FROM first f
     JOIN library_positions lp ON lp.game_id = f.game_id AND lp.ply = f.ply GROUP BY lp.next_uci, lp.result`,
    [key],
  )
  const tally = (result: string) =>
    rows.filter((r) => r.result === result).reduce((n, r) => n + r.n, 0)
  const byMove = new Map<string, ExplorerMove>()
  for (const r of rows) {
    if (!r.next_uci) continue
    const m = byMove.get(r.next_uci) ?? {
      uci: r.next_uci,
      games: 0,
      whiteWins: 0,
      draws: 0,
      blackWins: 0,
      eco: null,
      opening: null,
    }
    m.games += r.n
    if (r.result === '1-0') m.whiteWins += r.n
    else if (r.result === '0-1') m.blackWins += r.n
    else if (r.result === '1/2-1/2') m.draws += r.n
    byMove.set(r.next_uci, m)
  }
  const moves = [...byMove.values()].sort((a, b) => b.games - a.games || (a.uci < b.uci ? -1 : 1))
  const reached = new Map(moves.map((m) => [m.uci, keyAfter(fen, m.uci)]))
  const names = await openingNames(
    db,
    [...reached.values()].filter((k): k is string => k !== null),
  )
  for (const m of moves) {
    const name = names.get(reached.get(m.uci) ?? '')
    if (name) {
      m.eco = name.eco
      m.opening = name.name
    }
  }
  const games = await db.select<GameRow & { at: number }>(
    `${first} SELECT g.*, f.ply AS at FROM first f JOIN library_games g ON g.id = f.game_id
     ORDER BY g.year DESC, g.id LIMIT ?`,
    [key, items],
  )
  return {
    games: rows.reduce((n, r) => n + r.n, 0),
    whiteWins: tally('1-0'),
    draws: tally('1/2-1/2'),
    blackWins: tally('0-1'),
    moves,
    items: games.map((g) => ({
      id: g.id,
      white: g.white,
      black: g.black,
      year: g.year,
      event: g.event,
      result: g.result,
      ply: g.at,
      source: g.source,
      sourceRef: null,
    })),
  }
}

function keyAfter(fen: string, uci: string): string | null {
  try {
    const board = new Chess(fen)
    board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    })
    return positionKey(board.fen())
  } catch {
    return null
  }
}
