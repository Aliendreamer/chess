import { STANDARD_START, buildPgn, engineName, findLevel, judgeMove, seat } from '@chess/core'
import { newId } from './db'
import type {
  Color,
  ColourChoice,
  CommandOutcome,
  EndReason,
  EngineLevel,
  ThinkSeconds,
} from '@chess/core'
import type { Db } from './db'

/**
 * Games against the computer (desktop-app D6): chess.js is the rules, every move is written as it is made, a game in
 * play is resumed after a restart, and the engine is asked whenever it is its turn. Untimed: no clocks and no draw
 * offers; the person may resign. A game's end writes its PGN; the caller queues its review.
 */

/** Who plays the engine's side: `bestMove` at a level and think time, or null when it has no move. */
export interface EnginePlayer {
  bestMove: (fen: string, level: EngineLevel, thinkMs: number) => Promise<string | null>
}

export interface GameMove {
  ply: number
  uci: string
  san: string
  fenAfter: string
}

export interface DesktopGame {
  id: string
  status: 'playing' | 'ended'
  personColor: Color
  level: EngineLevel
  thinkSeconds: number
  ply: number
  fen: string
  result: string | null
  reason: EndReason | null
  pgn: string | null
  createdAt: string
  updatedAt: string
  moves: Array<GameMove>
}

interface GameRow {
  id: string
  status: 'playing' | 'ended'
  person_color: Color
  engine_level: string
  think_seconds: number
  ply: number
  fen: string
  result: string | null
  reason: EndReason | null
  pgn: string | null
  created_at: string
  updated_at: string
}

export const PERSON_NAME = 'You'

/** The side to move in a game. */
export function toMove(game: Pick<DesktopGame, 'fen'>): Color {
  return game.fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

export function engineToMove(game: DesktopGame): boolean {
  return game.status === 'playing' && toMove(game) !== game.personColor
}

export async function createGame(
  db: Db,
  choice: { level: string; color: ColourChoice; thinkSeconds: ThinkSeconds },
  now = new Date(),
  coin: () => boolean = () => Math.random() < 0.5,
): Promise<DesktopGame> {
  const level = findLevel(choice.level)
  if (!level) throw new Error(`No level ${choice.level}.`)
  const { person } = seat(choice.color, coin)
  const id = newId(now)
  const at = now.toISOString()
  await db.execute(
    `INSERT INTO games (id, status, person_color, engine_level, think_seconds, ply, fen, created_at, updated_at)
     VALUES (?, 'playing', ?, ?, ?, 0, ?, ?, ?)`,
    [id, person, level.level, choice.thinkSeconds, STANDARD_START, at, at],
  )
  return (await loadGame(db, id))!
}

export async function loadGame(db: Db, id: string): Promise<DesktopGame | null> {
  const [row] = await db.select<GameRow>('SELECT * FROM games WHERE id = ?', [id])
  if (!row) return null
  const moves = await db.select<{ ply: number; uci: string; san: string; fen_after: string }>(
    'SELECT ply, uci, san, fen_after FROM moves WHERE game_id = ? ORDER BY ply',
    [id],
  )
  return {
    id: row.id,
    status: row.status,
    personColor: row.person_color,
    level: findLevel(row.engine_level)!,
    thinkSeconds: row.think_seconds,
    ply: row.ply,
    fen: row.fen,
    result: row.result,
    reason: row.reason,
    pgn: row.pgn,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    moves: moves.map((m) => ({ ply: m.ply, uci: m.uci, san: m.san, fenAfter: m.fen_after })),
  }
}

/** The person's move: refused unless the game is in play, it is their turn, and the move is legal. */
export async function personMove(
  db: Db,
  id: string,
  uci: string,
  now = new Date(),
): Promise<CommandOutcome<DesktopGame>> {
  const game = await loadGame(db, id)
  if (!game) return { ok: false, status: 404, error: 'There is no such game.' }
  if (game.status !== 'playing') return { ok: false, status: 409, error: 'The game is over.' }
  if (toMove(game) !== game.personColor)
    return { ok: false, status: 409, error: 'It is not your move.' }
  return play(db, game, uci, now)
}

/** The engine's move when it is to move; the game unchanged otherwise. An engine with no move changes nothing. */
export async function engineMove(
  db: Db,
  engine: EnginePlayer,
  id: string,
  now: () => Date = () => new Date(),
): Promise<DesktopGame | null> {
  const game = await loadGame(db, id)
  if (!game || !engineToMove(game)) return game
  const uci = await engine.bestMove(game.fen, game.level, game.thinkSeconds * 1000)
  // The person may have resigned while the engine thought, or the game was otherwise settled: ask again.
  const now_ = now()
  const current = await loadGame(db, id)
  if (!uci || !current || !engineToMove(current) || current.ply !== game.ply) return current
  const outcome = await play(db, current, uci, now_)
  if (!outcome.ok) throw new Error(`The engine played an illegal move: ${uci} (${outcome.error})`)
  return outcome.view
}

export async function resign(
  db: Db,
  id: string,
  now = new Date(),
): Promise<CommandOutcome<DesktopGame>> {
  const game = await loadGame(db, id)
  if (!game) return { ok: false, status: 404, error: 'There is no such game.' }
  if (game.status !== 'playing') return { ok: false, status: 409, error: 'The game is over.' }
  await end(db, game, game.personColor === 'white' ? '0-1' : '1-0', 'resignation', now, [])
  return { ok: true, view: (await loadGame(db, id))! }
}

async function play(
  db: Db,
  game: DesktopGame,
  uci: string,
  now: Date,
): Promise<CommandOutcome<DesktopGame>> {
  const judged = judgeMove(
    game.moves.map((m) => m.uci),
    uci,
  )
  if (!judged) return { ok: false, status: 422, error: 'That move is not legal here.' }
  const at = now.toISOString()
  const ply = game.ply + 1
  const statements = [
    {
      sql: 'INSERT INTO moves (game_id, ply, uci, san, fen_after, played_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [game.id, ply, uci, judged.san, judged.fenAfter, at],
    },
    {
      sql: 'UPDATE games SET ply = ?, fen = ?, updated_at = ? WHERE id = ?',
      params: [ply, judged.fenAfter, at, game.id],
    },
  ]
  if (judged.end) {
    const sans = [...game.moves.map((m) => m.san), judged.san]
    await end(
      db,
      { ...game, ply, fen: judged.fenAfter },
      judged.end.result,
      judged.end.reason,
      now,
      statements,
      sans,
    )
  } else {
    await db.batch(statements)
  }
  return { ok: true, view: (await loadGame(db, game.id))! }
}

async function end(
  db: Db,
  game: DesktopGame,
  result: string,
  reason: EndReason,
  now: Date,
  before: Array<{ sql: string; params: Array<string | number | null> }>,
  sans: ReadonlyArray<string> = game.moves.map((m) => m.san),
) {
  const engine = engineName(game.level)
  const pgn = buildPgn({
    event: 'Game against the computer',
    site: 'Chess desktop',
    date: new Date(game.createdAt),
    white: game.personColor === 'white' ? PERSON_NAME : engine,
    black: game.personColor === 'black' ? PERSON_NAME : engine,
    result,
    reason,
    sans,
  })
  const at = now.toISOString()
  await db.batch([
    ...before,
    {
      sql: "UPDATE games SET status = 'ended', result = ?, reason = ?, pgn = ?, ended_at = ?, updated_at = ? WHERE id = ?",
      params: [result, reason, pgn, at, at, game.id],
    },
  ])
}

export interface GameListItem {
  id: string
  status: 'playing' | 'ended'
  personColor: Color
  level: EngineLevel
  ply: number
  result: string | null
  reason: EndReason | null
  updatedAt: string
}

/** The games, most recently played first, a page at a time (keyset on (updated_at, id), as the club's lists). */
export async function listGames(
  db: Db,
  limit: number,
  after?: { updatedAt: string; id: string },
): Promise<{ items: Array<GameListItem>; next: { updatedAt: string; id: string } | null }> {
  const rows = await db.select<GameRow>(
    after
      ? 'SELECT * FROM games WHERE (updated_at, id) < (?, ?) ORDER BY updated_at DESC, id DESC LIMIT ?'
      : 'SELECT * FROM games ORDER BY updated_at DESC, id DESC LIMIT ?',
    after ? [after.updatedAt, after.id, limit + 1] : [limit + 1],
  )
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    status: r.status,
    personColor: r.person_color,
    level: findLevel(r.engine_level)!,
    ply: r.ply,
    result: r.result,
    reason: r.reason,
    updatedAt: r.updated_at,
  }))
  const last = items.at(-1)
  return {
    items,
    next: rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
  }
}

/** The games still in play (resumed after a restart). */
export async function gamesInPlay(db: Db): Promise<Array<string>> {
  const rows = await db.select<{ id: string }>(
    "SELECT id FROM games WHERE status = 'playing' ORDER BY updated_at DESC",
  )
  return rows.map((r) => r.id)
}
