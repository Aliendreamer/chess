import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupTo, createStudies, listStudies, openDb } from '@chess/local'
import { nodeDatabase } from '@/testing/node-sql'
import { mobileFiles } from './files'
import { expoSql } from './sql'
import type { FilePlatform } from './files'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((d) => d.close()))
function sqlAt(path: string) {
  const native = nodeDatabase(path)
  opened.push(native)
  return Object.assign(expoSql(native), { close: () => native.close() })
}

function platform(dir: string, picked: string | null) {
  const shared: Array<{ path: string; mime: string }> = []
  const p: FilePlatform = {
    cacheDir: dir,
    dataDir: dir,
    pick: () => Promise.resolve(picked),
    share: (path, mime) => {
      shared.push({ path, mime })
      return Promise.resolve()
    },
    open: (path) => Promise.resolve(sqlAt(path)),
    readText: (path) => Promise.resolve(readFileSync(path, 'utf8')),
    writeText: (path, text) => Promise.resolve(writeFileSync(path, text)),
    now: () => new Date('2026-11-01T10:00:00.000Z'),
  }
  return { p, shared }
}

test('a backup made on the desktop restores on the phone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-files-'))
  const desktop = await openDb(sqlAt(join(dir, 'desktop.db')))
  await createStudies(desktop, [{ title: 'From the desktop', tree: [] }])
  await backupTo(desktop, join(dir, 'desktop.chessbackup'))

  const phone = await openDb(sqlAt(join(dir, 'phone.db')))
  await createStudies(phone, [{ title: 'Only on the phone', tree: [] }])
  const { p } = platform(dir, join(dir, 'desktop.chessbackup'))
  expect(await mobileFiles(phone, p).restore()).toMatchObject({ ok: true })
  expect((await listStudies(phone)).map((s) => s.title)).toEqual(['From the desktop'])
})

test('a backup goes to the share sheet as one file named for the day', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-files-'))
  const db = await openDb(sqlAt(join(dir, 'phone.db')))
  const { p, shared } = platform(dir, null)
  await mobileFiles(db, p).backup()
  expect(shared).toEqual([
    { path: join(dir, 'chess-2026-11-01.chessbackup'), mime: 'application/octet-stream' },
  ])
})

test('cancelling the picker changes nothing; PGN goes out and comes in as text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-files-'))
  const db = await openDb(sqlAt(join(dir, 'phone.db')))
  const { p, shared } = platform(dir, null)
  const files = mobileFiles(db, p)
  expect(await files.restore()).toBeNull()
  expect(await files.importText()).toBeNull()
  await files.exportText('Game 1.pgn', '1. e4 *')
  expect(shared).toEqual([{ path: join(dir, 'Game 1.pgn'), mime: 'application/x-chess-pgn' }])
  expect(readFileSync(join(dir, 'Game 1.pgn'), 'utf8')).toBe('1. e4 *')
  writeFileSync(join(dir, 'in.pgn'), '1. d4 *')
  expect(await mobileFiles(db, platform(dir, join(dir, 'in.pgn')).p).importText()).toBe('1. d4 *')
})
