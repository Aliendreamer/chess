import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START, parsePgn, studyLines, toInput } from '@chess/core'
import { openDb } from './db'
import { createStudies, listStudies, loadStudy, saveStudy, studyAsPgn } from './studies'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const FIVE = [1, 2, 3, 4, 5]
  .map((n) =>
    n === 3
      ? `[Event "Broken"]\n\n1. e4 e4 *`
      : `[Event "Game ${n}"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 (1... c5) 2. Nf3 *`,
  )
  .join('\n\n')

describe('studies (studies D1–D3, desktop-app)', () => {
  it('imports a PGN of five games with a broken third as four studies, reporting game 3', async () => {
    const db = await testDb()
    const parsed = parsePgn(FIVE)
    expect(parsed.flatMap((g) => (g.ok ? [] : [g.error]))).toEqual([
      expect.stringContaining('Game 3'),
    ])
    const result = await createStudies(
      db,
      parsed.flatMap((g) => (g.ok ? [g.study] : [])),
    )
    expect(result.created.map((c) => c.title)).toEqual(['Game 1', 'Game 2', 'Game 4', 'Game 5'])
    expect(await listStudies(db)).toHaveLength(4)
  })

  it('refuses a tree with an illegal move instead of cutting it', async () => {
    const db = await testDb()
    const result = await createStudies(db, [
      {
        title: 'Bad',
        startFen: STANDARD_START,
        tree: [{ uci: 'e2e4', children: [{ uci: 'e2e4', children: [] }] }],
      },
    ])
    expect(result).toEqual({
      created: [],
      refused: [{ index: 0, error: 'The moves include an illegal one.' }],
    })
  })

  it('saves with the version it was read at, and refuses a stale save', async () => {
    const db = await testDb()
    const { created } = await createStudies(db, [
      { title: 'Mine', startFen: STANDARD_START, tree: [] },
    ])
    const study = (await loadStudy(db, created[0]!.id))!
    const saved = await saveStudy(db, {
      id: study.id,
      title: 'Renamed',
      tree: [{ uci: 'd2d4', children: [] }],
      version: 1,
    })
    expect(saved).toMatchObject({ ok: true, view: { title: 'Renamed', version: 2 } })
    expect(saved.ok && saved.view.tree[0]?.san).toBe('d4')
    expect(await saveStudy(db, { id: study.id, title: 'Old', tree: [], version: 1 })).toMatchObject(
      { ok: false, status: 409 },
    )
  })

  it('drops the trainer progress of lines a save takes out of the tree', async () => {
    const db = await testDb()
    const tree = [
      {
        uci: 'e2e4',
        children: [
          { uci: 'e7e5', children: [] },
          { uci: 'c7c5', children: [] },
        ],
      },
    ]
    const { created } = await createStudies(db, [{ title: 'Rep', startFen: STANDARD_START, tree }])
    const study = (await loadStudy(db, created[0]!.id))!
    for (const line of studyLines(STANDARD_START, study.tree, 'white'))
      await db.execute(
        "INSERT INTO trainer_progress (line_key, color, study_id, box, due_at, updated_at) VALUES (?, 'white', ?, 1, '2026-01-01', '2026-01-01')",
        [line.key, study.id],
      )
    const kept = { ...study.tree[0]!, children: study.tree[0]!.children.slice(0, 1) }
    await saveStudy(db, {
      id: study.id,
      title: 'Rep',
      tree: toInput([kept]),
      version: study.version,
    })
    expect(await db.select('SELECT line_key FROM trainer_progress')).toHaveLength(1)
  })

  it('exports PGN with its variations', async () => {
    const db = await testDb()
    const games = parsePgn(FIVE).flatMap((g) => (g.ok ? [g.study] : []))
    const { created } = await createStudies(db, games.slice(0, 1))
    const pgn = studyAsPgn((await loadStudy(db, created[0]!.id))!)
    expect(pgn).toContain('[Event "Game 1"]')
    expect(pgn.trim().endsWith('1. e4 e5 (1... c5) 2. Nf3 *')).toBe(true)
  })
})
