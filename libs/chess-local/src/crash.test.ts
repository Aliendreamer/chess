import { afterEach, describe, expect, it } from 'vitest'
import { positionKey } from '@chess/core'
import { openDb } from './db.ts'
import { Evaluator } from './analysis.ts'
import { PositionFailed, isFailedPosition, recoverFromCrash } from './crash.ts'
import { createGame, engineMove, offerDraw, personMove, resign } from './play.ts'
import { loadReview, runReview } from './review.ts'
import { memorySql } from './testing.ts'
import type { EngineAnalysis, EngineScheduler } from './engine.ts'
import type { Db } from './db.ts'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const AFTER_F3 = 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1'
const AT = '2026-11-01T10:00:00.000Z'

function countingQueue() {
  const asked: Array<string> = []
  const queue = {
    analyse: (fen: string): Promise<EngineAnalysis> => {
      asked.push(fen)
      return Promise.resolve({ depth: 12, lines: [{ cp: 10, mate: null, pv: ['e7e5'] }] })
    },
  } as unknown as EngineScheduler
  return { queue, asked }
}

async function shortGame(db: Db) {
  const moves = ['e7e5']
  const engine = { bestMove: () => Promise.resolve(moves.shift() ?? null) }
  const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
  await personMove(db, game.id, 'f2f3')
  await engineMove(db, engine, game.id)
  return game.id
}

describe('after a Stockfish crash (mobile-app D13)', () => {
  it('records the position a review crashed on, and the review skips it from then on', async () => {
    const db = await testDb()
    const notice = await recoverFromCrash(db, {
      crash: { signal: 'SIGSEGV', at: AT, request: { kind: 'review', fen: AFTER_F3 } },
      marker: { kind: 'review', fen: AFTER_F3 },
    })
    expect(notice).toEqual({ kind: 'review', fen: AFTER_F3, signal: 'SIGSEGV', at: AT })
    expect(await isFailedPosition(db, AFTER_F3)).toBe(true)

    const id = await shortGame(db)
    await resign(db, id)
    const { queue, asked } = countingQueue()
    await runReview(db, new Evaluator(db, queue), id)
    expect(asked).not.toContain(AFTER_F3)
    expect(asked.length).toBeGreaterThan(0)
    expect((await loadReview(db, id))?.status).toBe('complete')
  })

  it('refuses a failed position to the background but not to the board', async () => {
    const db = await testDb()
    await recoverFromCrash(db, {
      crash: { signal: 'SIGSEGV', at: AT, request: { kind: 'miner', fen: AFTER_F3 } },
      marker: null,
    })
    const { queue, asked } = countingQueue()
    const evaluator = new Evaluator(db, queue)
    await expect(evaluator.evaluate(AFTER_F3, 800, 'miner')).rejects.toBeInstanceOf(PositionFailed)
    await expect(evaluator.evaluate(AFTER_F3, 800, 'judgement')).rejects.toBeInstanceOf(
      PositionFailed,
    )
    await evaluator.evaluate(AFTER_F3, 1000, 'board')
    expect(asked).toEqual([AFTER_F3])
  })

  it('declines an offer on a position the engine failed on', async () => {
    const db = await testDb()
    const id = await shortGame(db)
    const { queue } = countingQueue()
    const evaluator = new Evaluator(db, queue)
    const game = (await db.select<{ fen: string }>('SELECT fen FROM games WHERE id = ?', [id]))[0]!
    await recoverFromCrash(db, {
      crash: { signal: 'SIGSEGV', at: AT, request: { kind: 'judgement', fen: game.fen } },
      marker: null,
    })
    const answer = await offerDraw(db, evaluator, id)
    expect(answer).toMatchObject({ ok: true, view: { accepted: false } })
  })

  it('records nothing for a game move or the board: the player decides', async () => {
    const db = await testDb()
    const notice = await recoverFromCrash(db, {
      crash: { signal: 'SIGABRT', at: AT, request: { kind: 'game', fen: AFTER_F3 } },
      marker: null,
    })
    expect(notice?.kind).toBe('game')
    expect(await isFailedPosition(db, AFTER_F3)).toBe(false)
    expect(await db.select('SELECT * FROM engine_failures')).toEqual([])
  })

  it('shows nothing when the app was only killed while the engine thought', async () => {
    const db = await testDb()
    expect(
      await recoverFromCrash(db, { crash: null, marker: { kind: 'board', fen: AFTER_F3 } }),
    ).toBe(null)
    expect(await recoverFromCrash(db, { crash: null, marker: null })).toBe(null)
  })

  it('keys failures by position, whichever FEN wrote it', async () => {
    const db = await testDb()
    await recoverFromCrash(db, {
      crash: { signal: 'SIGSEGV', at: AT, request: { kind: 'review', fen: AFTER_F3 } },
      marker: null,
    })
    const [row] = await db.select<{ position_key: string }>(
      'SELECT position_key FROM engine_failures',
    )
    expect(row?.position_key).toBe(positionKey(AFTER_F3))
    expect(await isFailedPosition(db, AFTER_F3.replace(' 0 1', ' 3 7'))).toBe(true)
  })
})
