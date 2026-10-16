import { afterEach, describe, expect, it } from 'vitest'
import { openDb } from './db'
import { Evaluator } from './analysis'
import { importLibrary } from './library'
import { answerTraining, mineRound, nextTraining, trainingSummary } from './training'
import type { AnalysisQueue, EngineAnalysis } from '../engine'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const KASPAROV =
  '[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n[Date "1985.10.15"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 1-0'

/** An engine that gives every position two lines `cpGap` apart for the side to move. */

/** Mines until a round finds nothing new: one position per game a round, as the miner does. */
async function mineAll(db: Awaited<ReturnType<typeof testDb>>, evaluator: Evaluator) {
  const total = { examined: 0, kept: 0, rounds: 0 }
  for (;;) {
    const round = await mineRound(db, evaluator, OPTIONS)
    if (round.examined === 0) return total
    total.examined += round.examined
    total.kept += round.kept
    total.rounds++
  }
}
function twoLines(cpGap: number) {
  let asked = 0
  const queue = {
    analyse: (fen: string): Promise<EngineAnalysis> => {
      asked++
      // Scores are from White's side: the second line is worse for whoever is to move.
      const worse = fen.split(' ')[1] === 'w' ? -cpGap : cpGap
      return Promise.resolve({
        depth: 18,
        lines: [
          { cp: 0, mate: null, pv: ['a2a3'] },
          { cp: worse, mate: null, pv: ['h2h3'] },
        ],
      })
    },
  } as unknown as AnalysisQueue
  return { queue, asked: () => asked }
}

const OPTIONS = { minPly: 2, minGap: 0.25, perGame: 10, perRound: 10 }

describe('the miner (training D3)', () => {
  it('drops a quiet position and never asks it again', async () => {
    const db = await testDb()
    await importLibrary(db, KASPAROV, null)
    const engine = twoLines(30) // about 0.05 in winning chances
    expect(await mineAll(db, new Evaluator(db, engine.queue))).toEqual({
      examined: 4,
      kept: 0,
      rounds: 4,
    })
    expect(engine.asked()).toBe(4)
  })

  it('keeps a critical position with the master’s move, the accepted moves, the line and the game’s facts', async () => {
    const db = await testDb()
    await importLibrary(db, KASPAROV, null)
    expect((await mineAll(db, new Evaluator(db, twoLines(300).queue))).kept).toBe(4)
    const [p] = await db.select<{
      master_uci: string
      accepted_uci: string
      white: string
      year: number
      phase: string
    }>('SELECT master_uci, accepted_uci, white, year, phase FROM training_positions WHERE ply = 2')
    expect(p).toEqual({
      master_uci: 'g1f3',
      accepted_uci: '["a2a3"]',
      white: 'Kasparov, Garry',
      year: 1985,
      phase: 'middlegame',
    })
  })
})

describe('training sessions (training D4)', () => {
  it('offers master positions by player, judges the master’s move, and a wrong answer goes back to box 0', async () => {
    const db = await testDb()
    await importLibrary(db, KASPAROV, null)
    await mineAll(db, new Evaluator(db, twoLines(300).queue))
    const now = new Date('2026-10-16T10:00:00Z')
    expect((await nextTraining(db, 'library', { player: 'Carlsen' }, [], now)).item).toBeNull()
    const next = await nextTraining(db, 'library', { player: 'kasparov' }, [], now, () => 0)
    expect(next.pool).toBe(4)
    const id = next.item!.id
    const [position] = await db.select<{ master_uci: string }>(
      "SELECT master_uci FROM training_positions WHERE ('p:' || replace(id, '-', '')) = ?",
      [id],
    )
    const right = await answerTraining(db, 'library', id, position!.master_uci, now)
    expect(right).toMatchObject({ ok: true, view: { correct: true, verdict: 'master', box: 1 } })
    const wrong = await answerTraining(db, 'library', id, 'h2h4', now)
    expect(wrong).toMatchObject({ ok: true, view: { correct: false, verdict: 'none', box: 0 } })
    // Answered: due now again, and never offered twice in one session.
    expect((await nextTraining(db, 'library', {}, [id], now, () => 0)).item?.id).not.toBe(id)
    expect((await trainingSummary(db, now)).library).toEqual({
      pool: 4,
      seen: 1,
      learned: 0,
      due: 1,
    })
  })

  it('says the pool of my games is empty when no review has found a mistake', async () => {
    const db = await testDb()
    expect(await nextTraining(db, 'games', {}, [])).toEqual({ item: null, pool: 0 })
    expect(await answerTraining(db, 'games', 'g:0:1', 'e2e4')).toMatchObject({
      ok: false,
      status: 404,
    })
  })
})
