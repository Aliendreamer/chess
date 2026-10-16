import { positionKey } from '@chess/core'
import type { CommandOutcome, Evaluation, EvaluationLine, Think } from '@chess/core'
import type { AnalysisView } from '@chess/ui'
import type { AnalysisPriority, AnalysisQueue } from '../engine'
import type { Db } from './db'

/**
 * Evaluations (engine-analysis D1, desktop-app D5): one store per position and think time, `position_evaluations`. A
 * request is answered from it when a think at least as long is stored; otherwise the position is asked of the engine
 * once (later requests for it wait for that one) and the answer stored, keeping the deeper of two.
 */

export const THINK_MS: Record<Think, number> = { quick: 1000, normal: 3000, deep: 10000 }
export const ANALYSIS_LINES = 3

/** The best stored evaluation of a position at `minThinkMs` or longer, the longest first. */
export async function storedEvaluation(
  db: Db,
  key: string,
  minThinkMs = 0,
): Promise<Evaluation | null> {
  const [row] = await db.select<{ think_ms: number; depth: number; lines: string }>(
    'SELECT think_ms, depth, lines FROM position_evaluations WHERE position_key = ? AND think_ms >= ? ORDER BY think_ms DESC LIMIT 1',
    [key, minThinkMs],
  )
  return row
    ? {
        thinkMs: row.think_ms,
        depth: row.depth,
        lines: JSON.parse(row.lines) as Array<EvaluationLine>,
      }
    : null
}

/** Stores an answer, unless one at that think time is already deeper. */
export async function storeEvaluation(
  db: Db,
  key: string,
  evaluation: Evaluation,
  now = new Date(),
): Promise<void> {
  await db.execute(
    `INSERT INTO position_evaluations (position_key, think_ms, depth, lines, evaluated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (position_key, think_ms) DO UPDATE SET depth = excluded.depth, lines = excluded.lines,
       evaluated_at = excluded.evaluated_at WHERE excluded.depth > position_evaluations.depth`,
    [
      key,
      evaluation.thinkMs,
      evaluation.depth,
      JSON.stringify(evaluation.lines),
      now.toISOString(),
    ],
  )
}

/** The evaluations of the given positions at any think time, the longest each: the move tree's scores. */
export async function storedEvaluations(
  db: Db,
  keys: ReadonlyArray<string>,
): Promise<Map<string, Evaluation>> {
  if (keys.length === 0) return new Map()
  const rows = await db.select<{
    position_key: string
    think_ms: number
    depth: number
    lines: string
  }>(
    `SELECT position_key, think_ms, depth, lines FROM position_evaluations WHERE position_key IN (${keys.map(() => '?').join(', ')})
     ORDER BY think_ms`,
    keys,
  )
  return new Map(
    rows.map((r) => [
      r.position_key,
      { thinkMs: r.think_ms, depth: r.depth, lines: JSON.parse(r.lines) as Array<EvaluationLine> },
    ]),
  )
}

/** Asks and stores; one search per position and think time at a time, whoever asks. */
export class Evaluator {
  private readonly inFlight = new Map<string, Promise<Evaluation>>()

  constructor(
    private readonly db: Db,
    private readonly queue: AnalysisQueue,
  ) {}

  /**
   * The board's request (the shared `useAnalysis` hook polls it): the stored evaluation when there is one at this think
   * time or longer, otherwise none yet, with the search started.
   */
  async request(input: { fen: string; think: Think }): Promise<CommandOutcome<AnalysisView>> {
    const key = positionKey(input.fen)
    const thinkMs = THINK_MS[input.think]
    const stored = await storedEvaluation(this.db, key, thinkMs)
    if (!stored) void this.evaluate(input.fen, thinkMs, 'board').catch(() => undefined)
    return {
      ok: true,
      view: { key, fen: input.fen, think: input.think, thinkMs, evaluation: stored },
    }
  }

  /** An evaluation at `thinkMs` or longer, from the store or the engine (review and mining wait for it). */
  async evaluate(fen: string, thinkMs: number, priority: AnalysisPriority): Promise<Evaluation> {
    const key = positionKey(fen)
    const stored = await storedEvaluation(this.db, key, thinkMs)
    if (stored) return stored
    const id = `${key}|${thinkMs}`
    let running = this.inFlight.get(id)
    if (!running) {
      running = this.queue
        .analyse(fen, thinkMs, ANALYSIS_LINES, priority)
        .then(async (analysis) => {
          const evaluation = { thinkMs, depth: analysis.depth, lines: analysis.lines }
          await storeEvaluation(this.db, key, evaluation)
          return evaluation
        })
        .finally(() => this.inFlight.delete(id))
      this.inFlight.set(id, running)
    }
    return running
  }
}
