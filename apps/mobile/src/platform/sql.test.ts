import { DatabaseSync } from 'node:sqlite'
import { createStudies, listStudies, openDb, schemaVersion } from '@chess/local'
import { expoSql } from './sql'
import type { ExpoDatabase } from './sql'

/** expo-sqlite's async database, played by Node's own SQLite: the adapter is tested against a real engine. */
function nodeDatabase(): ExpoDatabase & { close: () => void } {
  const db = new DatabaseSync(':memory:')
  return {
    getAllAsync: <T>(sql: string, params: Array<string | number | null>) =>
      Promise.resolve(db.prepare(sql).all(...params) as Array<T>),
    runAsync: (sql: string, params: Array<string | number | null>) =>
      Promise.resolve({
        changes: Number(db.prepare(sql).run(...params).changes),
        lastInsertRowId: 0,
      }),
    execAsync: (sql: string) => {
      db.exec(sql)
      return Promise.resolve()
    },
    close: () => db.close(),
  }
}

test('runs the shared data layer: migrations, a batch, reads', async () => {
  const native = nodeDatabase()
  const sql = expoSql(native)
  const db = await openDb(sql)
  expect(await schemaVersion(sql)).toBe(2)
  await createStudies(db, [{ title: 'On the phone', tree: [] }])
  expect((await listStudies(db)).map((s) => s.title)).toEqual(['On the phone'])
  native.close()
})

test('counts the rows a statement changed, with parameters or as a script', async () => {
  const sql = expoSql(nodeDatabase())
  await sql.execute('CREATE TABLE t (n INTEGER)')
  expect(await sql.execute('INSERT INTO t (n) VALUES (?), (?)', [1, 2])).toEqual({
    rowsAffected: 2,
  })
  expect(await sql.execute('UPDATE t SET n = n + 1; DELETE FROM t WHERE n = 3')).toEqual({
    rowsAffected: 3,
  })
  expect(await sql.select<{ n: number }>('SELECT n FROM t')).toEqual([{ n: 2 }])
})
