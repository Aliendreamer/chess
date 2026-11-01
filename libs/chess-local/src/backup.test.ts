import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb } from './db'
import { backupTo, restoreFrom } from './backup'
import { createGame, listGames } from './play'
import { createStudies, listStudies } from './studies'
import { getSetting, setSetting } from './settings'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
function file(path: string) {
  const sql = memorySql(path)
  opened.push(sql)
  return sql
}
const dir = () => mkdtempSync(join(tmpdir(), 'chess-backup-'))
const opener = (path: string) => () => Promise.resolve(file(path))

describe('backup and restore (desktop-app D10)', () => {
  it('moves games, studies and settings to another machine', async () => {
    const d = dir()
    const here = await openDb(file(join(d, 'here.db')))
    await createGame(here, { level: '1320', color: 'white', thinkSeconds: 5 })
    await createStudies(here, [{ title: 'Rep', tree: [] }])
    await setSetting(here, 'preferences', { siteTheme: 'light' })
    await backupTo(here, join(d, 'backup.chessbackup'))

    const there = await openDb(file(join(d, 'there.db')))
    await createStudies(there, [{ title: 'Will be replaced', tree: [] }])
    const restored = await restoreFrom(
      there,
      { path: join(d, 'backup.chessbackup'), open: opener(join(d, 'backup.chessbackup')) },
      join(d, 'there.before-restore'),
    )
    expect(restored.ok).toBe(true)
    expect((await listGames(there, 10)).items).toHaveLength(1)
    expect((await listStudies(there)).map((s) => s.title)).toEqual(['Rep'])
    expect(await getSetting(there, 'preferences', {})).toEqual({ siteTheme: 'light' })
    expect(existsSync(join(d, 'there.before-restore'))).toBe(true)
  })

  it('refuses a file that is not a backup, or one from a newer version, changing nothing', async () => {
    const d = dir()
    const db = await openDb(file(join(d, 'main.db')))
    await createStudies(db, [{ title: 'Kept', tree: [] }])
    const other = file(join(d, 'other.db'))
    await other.execute('CREATE TABLE notes (id INTEGER)')
    const notOurs = await restoreFrom(
      db,
      { path: join(d, 'other.db'), open: () => Promise.resolve(other) },
      join(d, 'aside-1'),
    )
    expect(notOurs).toMatchObject({ ok: false, error: 'That file is not a backup of this app.' })
    const newer = file(join(d, 'newer.db'))
    await openDb(newer)
    await newer.execute('PRAGMA user_version = 99')
    const fromNewer = await restoreFrom(
      db,
      { path: join(d, 'newer.db'), open: () => Promise.resolve(newer) },
      join(d, 'aside-2'),
    )
    expect(fromNewer).toMatchObject({ ok: false, error: expect.stringContaining('newer version') })
    expect((await listStudies(db)).map((s) => s.title)).toEqual(['Kept'])
    expect(existsSync(join(d, 'aside-1'))).toBe(false)
  })
})
