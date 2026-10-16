import { afterEach, describe, expect, it } from 'vitest'
import { positionKey } from '@chess/core'
import { openDb } from './db'
import { allOpenings, embeddedOpenings, ensureOpenings, openingNames } from './openings'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function db() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const HEADER = 'eco\tname\tpgn'
const LIST_A = [`${HEADER}\nB20\tSicilian Defense\t1. e4 c5`]
const LIST_B = [`${HEADER}\nB20\tSicilian Defense\t1. e4 c5\nC20\tKing's Pawn Game\t1. e4 e5`]
const AFTER_E4_C5 = positionKey('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2')

describe('the openings list (desktop-app D4)', () => {
  it('is loaded on the first start, and not again while it is the same', async () => {
    const d = await db()
    expect(await ensureOpenings(d, () => Promise.resolve(LIST_A))).toBe('loaded')
    expect(await ensureOpenings(d, () => Promise.resolve(LIST_A))).toBe('current')
    expect((await allOpenings(d)).map((o) => o.name)).toEqual(['Sicilian Defense'])
  })

  it('is loaded again, whole, when a new app ships a changed list', async () => {
    const d = await db()
    await ensureOpenings(d, () => Promise.resolve(LIST_A))
    expect(await ensureOpenings(d, () => Promise.resolve(LIST_B))).toBe('loaded')
    expect((await allOpenings(d)).map((o) => o.name).sort()).toEqual([
      "King's Pawn Game",
      'Sicilian Defense',
    ])
  })

  it('names the positions it knows', async () => {
    const d = await db()
    await ensureOpenings(d, () => Promise.resolve(LIST_A))
    const names = await openingNames(d, [AFTER_E4_C5, 'unknown'])
    expect([...names]).toEqual([[AFTER_E4_C5, { eco: 'B20', name: 'Sicilian Defense' }]])
    expect(await openingNames(d, [])).toEqual(new Map())
    expect((await allOpenings(d))[0]?.movesUci).toEqual(['e2e4', 'c7c5'])
  })

  it('bundles the backend’s five files, thousands of named positions', async () => {
    const files = await embeddedOpenings()
    expect(files).toHaveLength(5)
    expect(files.every((f) => f.startsWith(HEADER))).toBe(true)
  })

  it('loads the real list in one batch', async () => {
    const d = await db()
    const started = performance.now()
    expect(await ensureOpenings(d)).toBe('loaded')
    const [row] = await d.select<{ n: number }>('SELECT count(*) AS n FROM openings')
    expect(row!.n).toBeGreaterThan(3000)
    expect(performance.now() - started).toBeLessThan(30_000)
  }, 60_000)
})
