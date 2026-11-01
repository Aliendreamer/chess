import { createStudies, listStudies, openDb, schemaVersion } from '@chess/local'
import { nodeDatabase } from '@/testing/node-sql'
import { expoSql } from './sql'

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
