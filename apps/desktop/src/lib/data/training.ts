import {
  TRAINING_DEFAULTS,
  afterRun,
  engineName,
  fenAfterPlies,
  findLevel,
  isLearned,
  judgeAnswer,
  judgeCritical,
  nextDrill,
  phaseOf,
  pickSpots,
  trainingIds,
} from '@chess/core'
import { newId } from './db'
import { REVIEW_THINK_MS } from './review'
import type { CommandOutcome } from '@chess/core'
import type {
  TrainingFilters,
  TrainingItem,
  TrainingMode,
  TrainingNext,
  TrainingSummary,
  TrainingVerdict,
} from '@chess/ui'
import type { Evaluator } from './analysis'
import type { Db } from './db'

/**
 * Training (training D1–D4, desktop-app): two pools that fill themselves — the person's own mistakes (copied from
 * complete reviews) and critical moments mined from the library's games — trained one position at a time, judged
 * here by `@chess/core`'s rules and scheduled in Leitner boxes.
 */

const sideOf = (fen: string) => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

// ---- The miner (training D3) ----

export interface MinerOptions {
  minPly: number
  minGap: number
  perGame: number
  /** Positions examined per round. */
  perRound: number
}

export const MINER_DEFAULTS: MinerOptions = {
  minPly: TRAINING_DEFAULTS.minPly,
  minGap: TRAINING_DEFAULTS.minGap,
  perGame: TRAINING_DEFAULTS.perGame,
  perRound: 5,
}

/**
 * One round: picks library positions from `minPly` on (at most `perGame` per game, never a position twice), has the
 * engine evaluate them behind the board's requests, and keeps the critical ones as training positions.
 */
export async function mineRound(
  db: Db,
  evaluator: Evaluator,
  options: MinerOptions = MINER_DEFAULTS,
  random: () => number = Math.random,
  now = new Date(),
): Promise<{ examined: number; kept: number }> {
  const spots = await db.select<{
    position_key: string
    game_id: string
    ply: number
    next_uci: string
  }>(
    `SELECT lp.position_key, lp.game_id, lp.ply, lp.next_uci FROM library_positions lp
     WHERE lp.ply >= ? AND lp.next_uci IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM training_candidates c WHERE c.position_key = lp.position_key)
       AND (SELECT count(*) FROM training_candidates c WHERE c.game_id = lp.game_id) < ?
     LIMIT 2000`,
    [options.minPly, options.perGame],
  )
  const picked = pickSpots(
    spots.map((s) => ({
      positionKey: s.position_key,
      gameId: s.game_id,
      ply: s.ply,
      nextUci: s.next_uci,
    })),
    options.perRound,
    random,
  )
  let kept = 0
  for (const spot of picked) {
    const [game] = await db.select<{
      moves_uci: string
      white: string
      black: string
      event: string | null
      year: number | null
      eco: string | null
      opening_name: string | null
    }>(
      'SELECT moves_uci, white, black, event, year, eco, opening_name FROM library_games WHERE id = ?',
      [spot.gameId],
    )
    const fen = game ? fenAfterPlies(JSON.parse(game.moves_uci) as Array<string>, spot.ply) : null
    if (!game || !fen) continue
    const at = now.toISOString()
    await db.execute(
      `INSERT INTO training_candidates (position_key, game_id, ply, fen, next_uci, asked_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (position_key) DO NOTHING`,
      [spot.positionKey, spot.gameId, spot.ply, fen, spot.nextUci, at],
    )
    const evaluation = await evaluator.evaluate(fen, REVIEW_THINK_MS, 'background')
    const moment = judgeCritical(fen, evaluation.lines, options.minGap)
    const statements: Array<{ sql: string; params: Array<string | number | null> }> = [
      {
        sql: 'UPDATE training_candidates SET judged_at = ?, critical = ? WHERE position_key = ?',
        params: [at, moment ? 1 : 0, spot.positionKey],
      },
    ]
    if (moment) {
      kept++
      statements.push({
        sql: `INSERT INTO training_positions (id, position_key, fen, master_uci, accepted_uci, best_line, gap, phase, eco,
              opening_name, white, black, event, year, library_game_id, ply, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (position_key) DO NOTHING`,
        params: [
          newId(now),
          spot.positionKey,
          fen,
          spot.nextUci,
          JSON.stringify(moment.acceptedUci),
          JSON.stringify(moment.bestLine),
          moment.gap,
          phaseOf(fen),
          game.eco,
          game.opening_name,
          game.white,
          game.black,
          game.event,
          game.year,
          spot.gameId,
          spot.ply,
          at,
        ],
      })
    }
    await db.batch(statements)
  }
  return { examined: picked.length, kept }
}

// ---- Sessions (training D4) ----

interface DrillRow {
  id: string
  game_id: string
  ply: number
  fen: string
  played_uci: string
  accepted_uci: string
  best_line: string
  box: number | null
  due_at: string | null
  updated_at: string
}

interface PositionRow {
  id: string
  fen: string
  master_uci: string
  accepted_uci: string
  best_line: string
  white: string
  black: string
  event: string | null
  year: number | null
  library_game_id: string
  ply: number
}

const like = (text: string) => `%${text.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`

/** The master positions matching the filters, as SQL. */
function filterSql(filters: TrainingFilters): { where: string; params: Array<string | number> } {
  const where: Array<string> = []
  const params: Array<string | number> = []
  const opening = filters.opening?.trim()
  if (opening) {
    if (/^[A-Ea-e][0-9]{0,2}$/.test(opening)) {
      where.push('p.eco LIKE ?')
      params.push(`${opening.toUpperCase()}%`)
    } else {
      where.push("p.opening_name LIKE ? ESCAPE '\\'")
      params.push(like(opening))
    }
  }
  if (filters.phase === 'middlegame' || filters.phase === 'endgame') {
    where.push('p.phase = ?')
    params.push(filters.phase)
  }
  if (filters.player?.trim()) {
    where.push("(p.white LIKE ? ESCAPE '\\' OR p.black LIKE ? ESCAPE '\\')")
    params.push(like(filters.player), like(filters.player))
  }
  if (filters.from !== undefined) {
    where.push('p.year >= ?')
    params.push(filters.from)
  }
  if (filters.to !== undefined) {
    where.push('p.year <= ?')
    params.push(filters.to)
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

/** The next position of a session: never one already in it (`exclude`), due ones first. */
export async function nextTraining(
  db: Db,
  mode: TrainingMode,
  filters: TrainingFilters,
  exclude: ReadonlyArray<string>,
  now = new Date(),
  random: () => number = Math.random,
): Promise<TrainingNext> {
  if (mode === 'games') {
    const drills = await db.select<DrillRow>('SELECT * FROM mistake_drills')
    const id = nextDrill(
      drills.map((d) => ({
        id: d.id,
        box: d.box ?? 0,
        dueAt: new Date(d.due_at ?? d.updated_at),
        updatedAt: new Date(d.updated_at),
      })),
      new Set(exclude),
      now,
    )
    const drill = drills.find((d) => d.id === id)
    return {
      item: drill
        ? { id: drill.id, mode, fen: drill.fen, sideToMove: sideOf(drill.fen), box: drill.box }
        : null,
      pool: drills.length,
    }
  }
  const { where, params } = filterSql(filters)
  const [count] = await db.select<{ n: number }>(
    `SELECT count(*) AS n FROM training_positions p ${where}`,
    params,
  )
  const excluded = exclude.filter((id) => trainingIds.isValid('library', id))
  const notExcluded = excluded.length
    ? `${where ? ' AND' : 'WHERE'} ('p:' || replace(p.id, '-', '')) NOT IN (${excluded.map(() => '?').join(', ')})`
    : ''
  const open = `${where}${notExcluded}`
  const openParams = [...params, ...excluded]
  const [due] = await db.select<PositionRow & { box: number }>(
    `SELECT p.*, t.box FROM training_positions p JOIN training_progress t ON t.position_id = p.id ${open}
     ${open ? 'AND' : 'WHERE'} t.due_at <= ? ORDER BY t.due_at, p.id LIMIT 1`,
    [...openParams, now.toISOString()],
  )
  const item = (p: PositionRow, box: number | null): TrainingItem => ({
    id: trainingIds.position(p.id),
    mode,
    fen: p.fen,
    sideToMove: sideOf(p.fen),
    box,
  })
  if (due) return { item: item(due, due.box), pool: count?.n ?? 0 }
  const fresh = await db.select<PositionRow>(
    `SELECT p.* FROM training_positions p ${open} ${open ? 'AND' : 'WHERE'}
     NOT EXISTS (SELECT 1 FROM training_progress t WHERE t.position_id = p.id)`,
    openParams,
  )
  const pick = fresh.length ? fresh[Math.floor(random() * fresh.length)] : undefined
  return { item: pick ? item(pick, null) : null, pool: count?.n ?? 0 }
}

/** Judges `uci` at a position and moves it in the person's boxes. */
export async function answerTraining(
  db: Db,
  mode: TrainingMode,
  id: string,
  uci: string,
  now = new Date(),
): Promise<CommandOutcome<TrainingVerdict>> {
  const at = now.toISOString()
  if (mode === 'games') {
    const [drill] = await db.select<DrillRow & { person_color: string; engine_level: string }>(
      `SELECT d.*, g.person_color, g.engine_level FROM mistake_drills d JOIN games g ON g.id = d.game_id WHERE d.id = ?`,
      [id],
    )
    if (!drill) return { ok: false, status: 404, error: 'There is no such position.' }
    const accepted = JSON.parse(drill.accepted_uci) as Array<string>
    const judged = judgeAnswer({ masterUci: null, acceptedUci: accepted }, uci)
    const next = afterRun(drill.box, judged.correct, now)
    await db.execute('UPDATE mistake_drills SET box = ?, due_at = ?, updated_at = ? WHERE id = ?', [
      next.box,
      next.dueAt.toISOString(),
      at,
      id,
    ])
    return {
      ok: true,
      view: {
        ...judged,
        masterUci: null,
        playedUci: drill.played_uci,
        acceptedUci: accepted,
        bestLine: JSON.parse(drill.best_line) as Array<string>,
        source: {
          kind: 'game',
          gameId: drill.game_id,
          ply: drill.ply,
          opponent: engineName(
            findLevel(drill.engine_level) ?? { level: 'max', userId: -5, label: 'Maximum' },
          ),
        },
        box: next.box,
        dueAt: next.dueAt.toISOString(),
        learned: isLearned(next.box),
      },
    }
  }
  const [position] = await db.select<PositionRow>(
    "SELECT * FROM training_positions WHERE ('p:' || replace(id, '-', '')) = ?",
    [id],
  )
  if (!position) return { ok: false, status: 404, error: 'There is no such position.' }
  const accepted = JSON.parse(position.accepted_uci) as Array<string>
  const judged = judgeAnswer({ masterUci: position.master_uci, acceptedUci: accepted }, uci)
  const [progress] = await db.select<{ box: number }>(
    'SELECT box FROM training_progress WHERE position_id = ?',
    [position.id],
  )
  const next = afterRun(progress?.box ?? null, judged.correct, now)
  await db.execute(
    `INSERT INTO training_progress (position_id, box, due_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (position_id) DO UPDATE SET box = excluded.box, due_at = excluded.due_at, updated_at = excluded.updated_at`,
    [position.id, next.box, next.dueAt.toISOString(), at],
  )
  return {
    ok: true,
    view: {
      ...judged,
      masterUci: position.master_uci,
      playedUci: null,
      acceptedUci: accepted,
      bestLine: JSON.parse(position.best_line) as Array<string>,
      source: {
        kind: 'library',
        libraryGameId: position.library_game_id,
        white: position.white,
        black: position.black,
        event: position.event,
        year: position.year,
        ply: position.ply,
      },
      box: next.box,
      dueAt: next.dueAt.toISOString(),
      learned: isLearned(next.box),
    },
  }
}

/** Both pools in numbers, for the training page. */
export async function trainingSummary(db: Db, now = new Date()): Promise<TrainingSummary> {
  const t = now.toISOString()
  const [games] = await db.select<{ positions: number; learned: number; due: number }>(
    `SELECT count(*) AS positions, coalesce(sum(coalesce(box, 0) >= 3), 0) AS learned,
            coalesce(sum(coalesce(due_at, updated_at) <= ?), 0) AS due FROM mistake_drills`,
    [t],
  )
  const [pool] = await db.select<{ n: number }>('SELECT count(*) AS n FROM training_positions')
  const [seen] = await db.select<{ seen: number; learned: number; due: number }>(
    `SELECT count(*) AS seen, coalesce(sum(box >= 3), 0) AS learned, coalesce(sum(due_at <= ?), 0) AS due
     FROM training_progress`,
    [t],
  )
  return {
    games: { positions: games?.positions ?? 0, learned: games?.learned ?? 0, due: games?.due ?? 0 },
    library: {
      pool: pool?.n ?? 0,
      seen: seen?.seen ?? 0,
      learned: seen?.learned ?? 0,
      due: seen?.due ?? 0,
    },
  }
}
