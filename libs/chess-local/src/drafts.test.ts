import { afterEach, describe, expect, it, vi } from 'vitest'
import { STANDARD_START, fromInput, playMove } from '@chess/core'
import { openDb } from './db.ts'
import { DRAFTS, clearDraft, draftWriter, loadBoardDraft, loadStudyDraft } from './drafts.ts'
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
