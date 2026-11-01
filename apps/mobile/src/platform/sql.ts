import type { Sql, SqlValue } from '@chess/local'

/** What the adapter needs of expo-sqlite's database (`openDatabaseAsync`); tests pass Node's SQLite. */
export interface ExpoDatabase {
  getAllAsync: <T>(sql: string, params: Array<SqlValue>) => Promise<Array<T>>
  runAsync: (sql: string, params: Array<SqlValue>) => Promise<{ changes: number }>
  execAsync: (sql: string) => Promise<void>
}

/**
 * expo-sqlite behind `@chess/local`'s {@link Sql} (mobile-app D9). A statement with parameters runs prepared; one
 * without may be a script of several (a migration, a batch, `VACUUM INTO`) and runs whole, its changed rows counted
 * by `total_changes()`. The single-writer queue and the migrations stay `@chess/local`'s.
 */
export function expoSql(db: ExpoDatabase): Sql {
  const totalChanges = async () =>
    (await db.getAllAsync<{ n: number }>('SELECT total_changes() AS n', []))[0]?.n ?? 0
  return {
    select: (text, params = []) => db.getAllAsync(text, [...params]),
    execute: async (text, params = []) => {
      if (params.length > 0) return { rowsAffected: (await db.runAsync(text, [...params])).changes }
      const before = await totalChanges()
      await db.execAsync(text)
      return { rowsAffected: (await totalChanges()) - before }
    },
  }
}

/** The app's database file (`chess.db` in expo-sqlite's directory), opened once. */
export async function openExpoSql(name = 'chess.db'): Promise<Sql> {
  const { openDatabaseAsync } = await import('expo-sqlite')
  return expoSql((await openDatabaseAsync(name)) as unknown as ExpoDatabase)
}
