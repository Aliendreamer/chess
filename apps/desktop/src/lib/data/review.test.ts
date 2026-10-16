import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START, positionKey } from '@chess/core'
import { openDb } from './db'
import { Evaluator, storeEvaluation } from './analysis'
import { createGame, engineMove, personMove, resign } from './play'
import { loadReview, reviewsToRun, runReview, startReview } from './review'
import type { AnalysisQueue, EngineAnalysis } from '../engine'
import type { Db } from './db'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

/** Fool's mate for the person as White: 1.f3 e5 2.g4 Qh4#, the engine playing Black. */
async function foolsMate(db: Db) {
  const moves = ['e7e5', 'd8h4']
  const engine = { bestMove: () => Promise.resolve(moves.shift() ?? null) }
  const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
  await personMove(db, game.id, 'f2f3')
  await engineMove(db, engine, game.id)
  await personMove(db, game.id, 'g2g4')
  await engineMove(db, engine, game.id)
  return game.id
}

/** An engine that scores every position by a table keyed by the FEN's side and move number, best first. */
function scoringQueue(score: (fen: string) => EngineAnalysis) {
  const asked: Array<{ thinkMs: number; priority: string }> = []
  const queue = {
    analyse: (fen: string, thinkMs: number, _lines: number, priority: string) => {
      asked.push({ thinkMs, priority })
      return Promise.resolve(score(fen))
    },
  } as unknown as AnalysisQueue
  return { queue, asked }
}

const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'

describe('game review (game-review, desktop-app)', () => {
  it('is run on a finished game at background priority, and its blunder enters training once', async () => {
    const db = await testDb()
    const id = await foolsMate(db)
    // After e5 the engine prefers Nc3 (−0.60); g4 is answered by mate, so it is the blunder.
    const { queue, asked } = scoringQueue((fen) =>
      fen === AFTER_E5
        ? {
            depth: 18,
            lines: [
              { cp: -60, mate: null, pv: ['b1c3', 'b8c6'] },
              { cp: -70, mate: null, pv: ['d2d4'] },
            ],
          }
        : fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2')
          ? { depth: 18, lines: [{ cp: null, mate: -1, pv: ['d8h4'] }] }
          : { depth: 18, lines: [{ cp: 20, mate: null, pv: ['e2e4'] }] },
    )
    expect((await loadReview(db, id))?.status).toBe('none')
    await runReview(db, new Evaluator(db, queue), id)
    expect(asked.every((a) => a.thinkMs === 800 && a.priority === 'background')).toBe(true)
    const reviewed = await loadReview(db, id)
    expect(reviewed?.status).toBe('complete')
    expect(reviewed?.moves[2]?.class).toBe('blunder')
    const drills = await db.select<{ ply: number; played_san: string }>(
      'SELECT ply, played_san FROM mistake_drills',
    )
    expect(drills).toEqual([{ ply: 3, played_san: 'g4' }])
    await runReview(db, new Evaluator(db, queue), id)
    expect(await db.select('SELECT id FROM mistake_drills')).toHaveLength(1)
    expect(await reviewsToRun(db)).toEqual([])
  })

  it('uses evaluations already stored, and asks only for the rest', async () => {
    const db = await testDb()
    const id = await foolsMate(db)
    await storeEvaluation(db, positionKey(STANDARD_START), {
      thinkMs: 3000,
      depth: 25,
      lines: [{ cp: 25, mate: null, pv: ['e2e4'] }],
    })
    const { queue, asked } = scoringQueue(() => ({
      depth: 18,
      lines: [{ cp: 20, mate: null, pv: ['e2e4'] }],
    }))
    await runReview(db, new Evaluator(db, queue), id)
    // The start, after f3, after e5, after g4; the mate itself is judged from the result.
    expect(asked).toHaveLength(3)
  })

  it('is not run on a game of one move, and is offered again at start when left unfinished', async () => {
    const db = await testDb()
    const short = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await personMove(db, short.id, 'e2e4')
    await resign(db, short.id)
    expect(
      await startReview(
        db,
        new Evaluator(db, scoringQueue(() => ({ depth: 1, lines: [] })).queue),
        short.id,
      ),
    ).toMatchObject({
      ok: false,
      status: 409,
    })
    const id = await foolsMate(db)
    expect(await reviewsToRun(db)).toEqual([id])
  })
})
