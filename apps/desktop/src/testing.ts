import { DatabaseSync } from 'node:sqlite'
import type { Sql, SqlValue } from '#/lib/data/db'

/** An in-memory SQLite behind the same interface as the plugin (desktop-app D9): node's own driver, no native build. */
export function memorySql(path = ':memory:'): Sql & { close: () => void } {
  const db = new DatabaseSync(path)
  return {
    select: <T>(sql: string, params: ReadonlyArray<SqlValue> = []) =>
      Promise.resolve(db.prepare(sql).all(...params) as Array<T>),
    execute: (sql: string, params: ReadonlyArray<SqlValue> = []) => {
      // Several statements (a migration, a batch) run as a script; one with parameters as a prepared statement.
      if (params.length === 0) {
        const before = db.prepare('SELECT total_changes() AS n').get() as { n: number }
        db.exec(sql)
        const after = db.prepare('SELECT total_changes() AS n').get() as { n: number }
        return Promise.resolve({ rowsAffected: after.n - before.n })
      }
      return Promise.resolve({ rowsAffected: Number(db.prepare(sql).run(...params).changes) })
    },
    close: () => db.close(),
  }
}
