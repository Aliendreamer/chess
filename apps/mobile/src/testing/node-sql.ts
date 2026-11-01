import { DatabaseSync } from 'node:sqlite'
import type { ExpoDatabase } from '@/platform/sql'

/** expo-sqlite's async database played by Node's own SQLite, for tests: the adapter runs against a real engine. */
export function nodeDatabase(path = ':memory:'): ExpoDatabase & { close: () => void } {
  const db = new DatabaseSync(path)
  return {
    getAllAsync: <T>(sql: string, params: Array<string | number | null>) =>
      Promise.resolve(db.prepare(sql).all(...params) as Array<T>),
    runAsync: (sql: string, params: Array<string | number | null>) =>
      Promise.resolve({ changes: Number(db.prepare(sql).run(...params).changes) }),
    execAsync: (sql: string) => {
      db.exec(sql)
      return Promise.resolve()
    },
    close: () => {
      if (db.isOpen) db.close()
    },
  }
}
