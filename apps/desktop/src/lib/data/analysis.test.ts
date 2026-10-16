import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START, positionKey } from '@chess/core'
import { openDb } from './db'
import { Evaluator, storeEvaluation, storedEvaluation, storedEvaluations } from './analysis'
import type { AnalysisQueue, EngineAnalysis } from '../engine'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const KEY = positionKey(STANDARD_START)
const line = (cp: number) => ({ cp, mate: null, pv: ['e2e4'] })

/** A queue that answers after `release()`, counting what it was asked. */
function fakeQueue() {
  const asked: Array<{ thinkMs: number; priority: string }> = []
  let release: () => void = () => {}
  const queue = {
    analyse: (_fen: string, thinkMs: number, _lines: number, priority: string) => {
      asked.push({ thinkMs, priority })
      return new Promise<EngineAnalysis>((resolve) => {
        release = () => resolve({ depth: 20, lines: [line(30)] })
      })
    },
  } as unknown as AnalysisQueue
  return { queue, asked, release: () => release() }
}

describe('evaluations (engine-analysis D1)', () => {
  it('answer a shorter request from a longer think, without the engine', async () => {
    const db = await testDb()
    await storeEvaluation(db, KEY, { thinkMs: 10_000, depth: 30, lines: [line(25)] })
    const fake = fakeQueue()
    const answer = await new Evaluator(db, fake.queue).request({
      fen: STANDARD_START,
      think: 'normal',
    })
    expect(answer).toMatchObject({
      ok: true,
      view: { thinkMs: 3000, evaluation: { thinkMs: 10_000, depth: 30 } },
    })
    expect(fake.asked).toEqual([])
  })

  it('ask the engine once for a position not stored, and store its answer', async () => {
    const db = await testDb()
    const fake = fakeQueue()
    const evaluator = new Evaluator(db, fake.queue)
    const first = await evaluator.request({ fen: STANDARD_START, think: 'quick' })
    expect(first.ok && first.view.evaluation).toBeNull()
    await evaluator.request({ fen: STANDARD_START, think: 'quick' })
    expect(fake.asked).toEqual([{ thinkMs: 1000, priority: 'board' }])
    fake.release()
    await new Promise((r) => setTimeout(r, 0))
    expect(await storedEvaluation(db, KEY, 1000)).toMatchObject({ depth: 20 })
  })

  it('keep the deeper of two answers at one think time', async () => {
    const db = await testDb()
    await storeEvaluation(db, KEY, { thinkMs: 1000, depth: 22, lines: [line(10)] })
    await storeEvaluation(db, KEY, { thinkMs: 1000, depth: 18, lines: [line(99)] })
    expect((await storedEvaluation(db, KEY))?.lines[0]?.cp).toBe(10)
    await storeEvaluation(db, KEY, { thinkMs: 1000, depth: 24, lines: [line(12)] })
    expect((await storedEvaluation(db, KEY))?.lines[0]?.cp).toBe(12)
  })

  it('give the longest evaluation of each position asked', async () => {
    const db = await testDb()
    await storeEvaluation(db, KEY, { thinkMs: 1000, depth: 18, lines: [line(10)] })
    await storeEvaluation(db, KEY, { thinkMs: 3000, depth: 24, lines: [line(15)] })
    const all = await storedEvaluations(db, [KEY, 'other'])
    expect([...all.keys()]).toEqual([KEY])
    expect(all.get(KEY)?.thinkMs).toBe(3000)
  })

  it('let background work wait for the answer', async () => {
    const db = await testDb()
    const fake = fakeQueue()
    const evaluating = new Evaluator(db, fake.queue).evaluate(STANDARD_START, 800, 'background')
    await new Promise((r) => setTimeout(r, 0))
    fake.release()
    expect((await evaluating).depth).toBe(20)
    expect(fake.asked).toEqual([{ thinkMs: 800, priority: 'background' }])
  })
})
