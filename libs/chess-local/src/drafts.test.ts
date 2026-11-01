import { afterEach, describe, expect, it, vi } from 'vitest'
import { STANDARD_START, fromInput, playMove } from '@chess/core'
import { openDb } from './db.ts'
import {
  DRAFTS,
  analysisStart,
  clearDraft,
  draftWriter,
  loadBoardDraft,
  loadStudyDraft,
} from './drafts.ts'
import { createGame, engineMove, personMove, resign } from './play.ts'
import { memorySql } from './testing.ts'

const opened: Array<{ close: () => void }> = []
afterEach(() => {
  vi.useRealTimers()
  opened.splice(0).forEach((db) => db.close())
})
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const e4 = playMove(STANDARD_START, 'e2e4')!
const tree = fromInput(STANDARD_START, [{ uci: 'e2e4', children: [{ uci: 'e7e5', children: [] }] }])

describe('drafts (mobile-app D13)', () => {
  it('keeps the analysis board as it changes, written once things settle', async () => {
    const db = await testDb()
    vi.useFakeTimers()
    const writer = draftWriter(db, DRAFTS.analysis, 500)
    writer.write({ startFen: STANDARD_START, tree: [], path: [] })
    writer.write({ startFen: STANDARD_START, tree, path: [0, 0] })
    expect(await loadBoardDraft(db)).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    vi.useRealTimers()
    const draft = await loadBoardDraft(db)
    expect(draft?.path).toEqual([0, 0])
    expect(draft?.tree[0]?.san).toBe('e4')
    expect(draft?.tree[0]?.children[0]?.fen).toBe(playMove(e4.fen, 'e7e5')!.fen)
  })

  it('writes what is pending at once on flush, and nothing after a clear', async () => {
    const db = await testDb()
    const writer = draftWriter(db, DRAFTS.analysis, 10_000)
    writer.write({ startFen: STANDARD_START, tree, path: [0] })
    await writer.flush()
    expect((await loadBoardDraft(db))?.path).toEqual([0])
    writer.write({ startFen: STANDARD_START, tree: [], path: [] })
    await writer.clear()
    expect(await loadBoardDraft(db)).toBeNull()
  })

  it('keeps a study edit for the version it was made on', async () => {
    const db = await testDb()
    const writer = draftWriter(db, DRAFTS.study('s1'), 0)
    writer.write({ title: 'Edited', startFen: STANDARD_START, tree, path: [0], version: 3 })
    await writer.flush()
    expect((await loadStudyDraft(db, 's1', 3))?.title).toBe('Edited')
    // Saved since (another version): the draft is stale and dropped.
    expect(await loadStudyDraft(db, 's1', 4)).toBeNull()
    expect(await loadStudyDraft(db, 's1', 3)).toBeNull()
    await clearDraft(db, DRAFTS.study('s1'))
  })
})

describe('where the analysis board starts (analysis-board)', () => {
  it('opens a finished game at its end, named by its players', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1320', color: 'black', thinkSeconds: 5 })
    await engineMove(db, { bestMove: () => Promise.resolve('e2e4') }, game.id)
    await personMove(db, game.id, 'e7e5')
    await resign(db, game.id)
    const start = await analysisStart(db, { game: game.id })
    expect(start.tree.map((m) => m.san)).toEqual(['e4'])
    expect(start.path).toEqual([0, 0])
    expect(start.players).toEqual({ white: 'Stockfish (Casual)', black: 'You' })
    expect(start.error).toBeNull()
  })

  it('refuses a game in play, a missing library game and a bad FEN', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
    expect((await analysisStart(db, { game: game.id })).error).toContain('once it has ended')
    expect((await analysisStart(db, { library: 'nope' })).error).toBe(
      'There is no such library game.',
    )
    expect((await analysisStart(db, { fen: 'not a fen' })).error).toBe(
      'That is not a legal position.',
    )
  })

  it('opens where the player left it, unless a FEN is asked for', async () => {
    const db = await testDb()
    const writer = draftWriter(db, DRAFTS.analysis, 0)
    writer.write({ startFen: STANDARD_START, tree, path: [0] })
    await writer.flush()
    expect((await analysisStart(db, {})).path).toEqual([0])
    expect((await analysisStart(db, { fen: STANDARD_START })).tree).toEqual([])
  })
})
