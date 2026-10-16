import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, inline, literal, openDb, schemaVersion } from './db'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
const fresh = (path?: string) => {
  const sql = memorySql(path)
  opened.push(sql)
  return sql
}

const TABLES = [
  'chess_events',
  'games',
  'library_games',
  'library_positions',
  'mistake_drills',
  'moves',
  'news_items',
  'openings',
  'position_evaluations',
  'reviews',
  'settings',
  'studies',
  'trainer_progress',
  'training_candidates',
  'training_positions',
  'training_progress',
]

describe('openDb (desktop-app D4)', () => {
  it('creates every table on an empty database and records the schema version', async () => {
    const sql = fresh()
    await openDb(sql)
    const tables = await sql.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    expect(tables.map((t) => t.name)).toEqual(TABLES)
    expect(await schemaVersion(sql)).toBe(MIGRATIONS.length)
  })

  it('runs only the migrations still pending, after copying a database that has data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chess-db-'))
    const sql = fresh(join(dir, 'chess.db'))
    await openDb(sql, undefined, MIGRATIONS)
    await sql.execute("INSERT INTO settings (key, value) VALUES ('site', '\"dark\"')")
    const next = [...MIGRATIONS, 'CREATE TABLE extra (id INTEGER PRIMARY KEY)']
    await openDb(sql, (v) => join(dir, `chess.db.before-v${v}`), next)
    expect(await schemaVersion(sql)).toBe(next.length)
    expect(existsSync(join(dir, `chess.db.before-v${MIGRATIONS.length}`))).toBe(true)
    // Opening again migrates nothing and copies nothing.
    await openDb(sql, () => join(dir, 'never'), next)
    expect(existsSync(join(dir, 'never'))).toBe(false)
  })

  it('refuses a database from a newer version of the app', async () => {
    const sql = fresh()
    await sql.execute('PRAGMA user_version = 99')
    await expect(openDb(sql)).rejects.toThrow(/newer version/)
  })

  it('commits a batch as one, or none of it', async () => {
    const sql = fresh()
    const db = await openDb(sql)
    await db.batch([
      { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', params: ['a', '1'] },
      { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', params: ['b', "it's"] },
    ])
    await expect(
      db.batch([
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', params: ['c', '3'] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', params: ['a', 'clash'] },
      ]),
    ).rejects.toThrow()
    const rows = await db.select<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('a', 'b', 'c') ORDER BY key",
    )
    expect(rows).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: "it's" },
    ])
  })

  it('runs writes one after another, a failed one not stopping the next', async () => {
    const db = await openDb(fresh())
    const order: Array<string> = []
    await Promise.allSettled([
      db
        .execute("INSERT INTO settings (key, value) VALUES ('x', '1')")
        .then(() => order.push('first')),
      db.execute('INSERT INTO nowhere VALUES (1)').catch(() => order.push('failed')),
      db
        .execute("INSERT INTO settings (key, value) VALUES ('y', '2')")
        .then(() => order.push('third')),
    ])
    expect(order).toEqual(['first', 'failed', 'third'])
  })
})

describe('inlined parameters', () => {
  it('quote text, keep numbers and NULL, and leave a ? inside a literal alone', () => {
    expect(inline({ sql: "SELECT ?, ?, ?, '?'", params: ["O'Kelly", 12.5, null] })).toBe(
      "SELECT 'O''Kelly', 12.5, NULL, '?'",
    )
  })

  it('refuse a count mismatch and values that cannot be stored', () => {
    expect(() => inline({ sql: 'SELECT ?', params: [] })).toThrow(/Too few/)
    expect(() => inline({ sql: 'SELECT 1', params: [1] })).toThrow(/Too many/)
    expect(() => literal(Number.NaN)).toThrow()
    expect(() => literal('a\0b')).toThrow()
  })
})
