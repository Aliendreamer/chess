import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START } from '@chess/core'
import { openDb } from './db'
import { ensureOpenings } from './openings'
import { createStudies } from './studies'
import {
  familyLines,
  isNamedLine,
  nextFamilyLine,
  nextStudyLine,
  recordRun,
  studyDrill,
  trainerFamilies,
  trainerStudies,
} from './trainer'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
const LIST = [
  'eco\tname\tpgn',
  'C60\tRuy Lopez\t1. e4 e5 2. Nf3 Nc6 3. Bb5',
  'C65\tRuy Lopez: Berlin Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6',
  'C70\tRuy Lopez: Morphy Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
  'B20\tSicilian Defense\t1. e4 c5',
].join('\n')
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  const db = await openDb(sql)
  await ensureOpenings(db, () => Promise.resolve([LIST]))
  return db
}
const NOW = new Date('2026-10-16T10:00:00Z')

describe('the opening trainer (opening-trainer, desktop-app)', () => {
  it('lists the families with the lines learned, and searches them', async () => {
    const db = await testDb()
    expect(await trainerFamilies(db, 'white')).toEqual([
      { name: 'Ruy Lopez', lines: 2, learned: 0 },
      { name: 'Sicilian Defense', lines: 1, learned: 0 },
    ])
    expect((await trainerFamilies(db, 'white', 'berlin')).map((f) => f.name)).toEqual([
      'Ruy Lopez: Berlin Defense',
    ])
  })

  it('moves a clean box-2 line to box 3, due in 7 days, and counts it learned', async () => {
    const db = await testDb()
    const [berlin] = (await familyLines(db, 'Ruy Lopez: Berlin Defense', 'white'))!
    await recordRun(db, { lineKey: berlin!.key, color: 'white', mistakes: 0 }, NOW)
    await recordRun(db, { lineKey: berlin!.key, color: 'white', mistakes: 0 }, NOW)
    const result = await recordRun(db, { lineKey: berlin!.key, color: 'white', mistakes: 0 }, NOW)
    expect(result).toEqual({
      lineKey: berlin!.key,
      box: 3,
      dueAt: '2026-10-23T10:00:00.000Z',
      learned: true,
    })
    expect((await trainerFamilies(db, 'white'))[0]?.learned).toBe(1)
    expect((await trainerFamilies(db, 'black'))[0]?.learned).toBe(0)
    expect(await isNamedLine(db, berlin!.key)).toBe(true)
  })

  it('offers the line due first, a mistake putting it back to now', async () => {
    const db = await testDb()
    const lines = (await familyLines(db, 'Ruy Lopez', 'black'))!
    await recordRun(db, { lineKey: lines[0]!.key, color: 'black', mistakes: 0 }, NOW)
    expect((await nextFamilyLine(db, 'Ruy Lopez', 'black', NOW))?.line?.key).toBe(lines[1]!.key)
    await recordRun(db, { lineKey: lines[1]!.key, color: 'black', mistakes: 2 }, NOW)
    expect((await nextFamilyLine(db, 'Ruy Lopez', 'black', NOW))?.line?.key).toBe(lines[1]!.key)
    expect(await nextFamilyLine(db, 'Nothing', 'white', NOW)).toBeNull()
  })

  it('trains a study’s lines, and lists the studies that have lines for the side', async () => {
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
    const id = created[0]!.id
    const drill = (await studyDrill(db, id, 'white'))!
    expect(drill.lines.map((l) => l.moves.join(' '))).toEqual(['e2e4 e7e5', 'e2e4 c7c5'])
    await recordRun(
      db,
      { lineKey: drill.lines[0]!.key, color: 'white', mistakes: 0, studyId: id },
      NOW,
    )
    expect((await nextStudyLine(db, id, 'white', NOW))?.line?.key).toBe(drill.lines[1]!.key)
    expect(await trainerStudies(db, 'white')).toMatchObject([
      { id, title: 'Rep', lines: 2, learned: 0 },
    ])
  })
})
