import { STANDARD_START, missing, positionKey, practice, review, trainingIds } from '@chess/core'
import { storedEvaluations } from './analysis'
import { openingNames } from './openings'
import { loadGame } from './play'
import type { CommandOutcome, ReviewInput } from '@chess/core'
import type { ReviewView } from '@chess/ui'
import type { Evaluator } from './analysis'
import type { Db } from './db'
import type { DesktopGame } from './play'

/**
 * Game review (game-review, desktop-app): every finished game with two moves or more is reviewed without anyone
 * asking — its positions not yet evaluated go to the analysis engine at background priority, 800 ms each (kept apart
 * from the board's think times) — and the review is computed on read. Once it is complete, the person's mistakes and
 * blunders enter training (`mistake_drills`), once.
 */

export const REVIEW_THINK_MS = 800

async function inputOf(db: Db, game: DesktopGame): Promise<ReviewInput> {
  const fens = [STANDARD_START, ...game.moves.map((m) => m.fenAfter)]
  const keys = [...new Set(fens.map(positionKey))]
  const evaluations = new Map(
    [...(await storedEvaluations(db, keys))].filter(([, e]) => e.thinkMs >= REVIEW_THINK_MS),
  )
  return {
    moves: game.moves,
    result: game.result,
    reason: game.reason,
    evaluations,
    openings: await openingNames(db, keys),
  }
}

/** The review as far as it goes: none (never asked), running, or complete. */
export async function loadReview(db: Db, gameId: string): Promise<ReviewView | null> {
  const game = await loadGame(db, gameId)
  if (!game || game.status !== 'ended') return null
  const [row] = await db.select<{ complete: number }>(
    'SELECT complete FROM reviews WHERE game_id = ?',
    [gameId],
  )
  const input = await inputOf(db, game)
  const status = !row ? 'none' : missing(input).length === 0 ? 'complete' : 'running'
  return { status, ...review(input) }
}

/** Whether a game is reviewed at all: ended, with two moves or more, not aborted. */
export function reviewable(game: DesktopGame): boolean {
  return game.status === 'ended' && game.ply >= 2 && game.reason !== 'aborted'
}

/**
 * Starts (or resumes) a review: the missing positions are evaluated one after another behind the board's requests;
 * when none is missing, the review is complete and its mistakes are copied. Resolves when it is complete.
 */
export async function runReview(
  db: Db,
  evaluator: Evaluator,
  gameId: string,
  now = new Date(),
): Promise<void> {
  const game = await loadGame(db, gameId)
  if (!game || !reviewable(game)) return
  await db.execute(
    'INSERT INTO reviews (game_id, requested_at) VALUES (?, ?) ON CONFLICT (game_id) DO NOTHING',
    [gameId, now.toISOString()],
  )
  for (const position of missing(await inputOf(db, game))) {
    await evaluator.evaluate(position.fen, REVIEW_THINK_MS, 'background')
  }
  await db.execute('UPDATE reviews SET complete = 1 WHERE game_id = ?', [gameId])
  await syncDrills(db, game, now)
}

/** The page's "review this game": started in the background, answered with the review as it stands. */
export async function startReview(
  db: Db,
  evaluator: Evaluator,
  gameId: string,
): Promise<CommandOutcome<ReviewView>> {
  const game = await loadGame(db, gameId)
  if (!game) return { ok: false, status: 404, error: 'There is no such game.' }
  if (!reviewable(game)) return { ok: false, status: 409, error: 'This game cannot be reviewed.' }
  void runReview(db, evaluator, gameId).catch(() => undefined)
  return { ok: true, view: (await loadReview(db, gameId))! }
}

/** Copies the person's mistakes of a complete review into training, once per game. */
async function syncDrills(db: Db, game: DesktopGame, now: Date) {
  const [row] = await db.select<{ synced: number }>(
    'SELECT synced FROM reviews WHERE game_id = ?',
    [game.id],
  )
  if (!row || row.synced === 1) return
  const at = now.toISOString()
  const drills = practice(await inputOf(db, game), game.personColor)
  await db.batch([
    ...drills.map((d) => ({
      sql: `INSERT INTO mistake_drills (id, game_id, ply, fen, played_uci, played_san, accepted_uci, best_line, class, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      params: [
        trainingIds.game(game.id, d.ply),
        game.id,
        d.ply,
        d.fen,
        d.playedUci,
        d.playedSan,
        JSON.stringify(d.acceptedUci),
        JSON.stringify(d.bestLine),
        d.class,
        at,
      ],
    })),
    { sql: 'UPDATE reviews SET synced = 1 WHERE game_id = ?', params: [game.id] },
  ])
}

/** At start: every finished game not yet reviewed completely, oldest first (a review left running, or never begun). */
export async function reviewsToRun(db: Db): Promise<Array<string>> {
  const rows = await db.select<{ id: string }>(
    `SELECT g.id FROM games g LEFT JOIN reviews r ON r.game_id = g.id
     WHERE g.status = 'ended' AND g.ply >= 2 AND (g.reason IS NULL OR g.reason <> 'aborted')
       AND (r.game_id IS NULL OR r.complete = 0 OR r.synced = 0)
     ORDER BY g.ended_at`,
  )
  return rows.map((r) => r.id)
}
