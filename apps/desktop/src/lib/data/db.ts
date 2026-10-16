import init from './migrations/0001_init.sql?raw'

/**
 * The app's one database (desktop-app D4): a SQLite file in the app data directory, reached through `tauri-plugin-sql`
 * in the app and through `node:sqlite` in tests, behind the same {@link Sql} interface. Migrations run here, in order,
 * tracked by SQLite's `user_version`; before a database that has data is migrated, a copy is kept next to it. Every
 * write goes through one queue, so writes never interleave, and a batch of statements commits or fails as one.
 */

export type SqlValue = string | number | null

export interface Sql {
  select: <T>(sql: string, params?: ReadonlyArray<SqlValue>) => Promise<Array<T>>
  execute: (sql: string, params?: ReadonlyArray<SqlValue>) => Promise<{ rowsAffected: number }>
}

export interface Statement {
  sql: string
  params?: ReadonlyArray<SqlValue>
}

/** The migrations, in order: the n-th takes the database to `user_version` n. */
export const MIGRATIONS: ReadonlyArray<string> = [init]

export interface Db {
  /** A read: it runs at once, beside any write in flight (WAL). */
  select: <T>(sql: string, params?: ReadonlyArray<SqlValue>) => Promise<Array<T>>
  /** One write, after every write before it. */
  execute: (sql: string, params?: ReadonlyArray<SqlValue>) => Promise<{ rowsAffected: number }>
  /** Several writes as one transaction, after every write before it. */
  batch: (statements: ReadonlyArray<Statement>) => Promise<void>
  /**
   * A script run as one call on one connection, after every write before it: for what cannot be in a transaction
   * (`VACUUM INTO`, `ATTACH`). Text only, no parameters.
   */
  script: (sql: string) => Promise<void>
}

/**
 * Opens the database: WAL and foreign keys on, then every pending migration, each in its own transaction. When the
 * database already has a schema and one is pending, `backup(version)` names the file it is first copied to.
 */
export async function openDb(
  sql: Sql,
  backup?: (fromVersion: number) => string,
  migrations: ReadonlyArray<string> = MIGRATIONS,
): Promise<Db> {
  await sql.execute('PRAGMA journal_mode = WAL')
  await sql.execute('PRAGMA foreign_keys = ON')
  const [row] = await sql.select<{ user_version: number }>('PRAGMA user_version')
  const version = row?.user_version ?? 0
  if (version > migrations.length)
    throw new Error(`The database is from a newer version of the app (schema ${version}).`)
  if (version > 0 && version < migrations.length && backup) {
    await sql.execute(`VACUUM INTO ${literal(backup(version))}`)
  }
  for (let v = version; v < migrations.length; v++) {
    await sql.execute(transaction([migrations[v]!, `PRAGMA user_version = ${v + 1}`]))
  }

  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work)
    queue = run.catch(() => undefined)
    return run
  }
  return {
    select: (text, params) => sql.select(text, params),
    execute: (text, params) => serial(() => sql.execute(text, params)),
    batch: (statements) =>
      serial(async () => {
        if (statements.length === 0) return
        try {
          await sql.execute(transaction(statements.map(inline)))
        } catch (e) {
          // A statement failed between BEGIN and COMMIT: end the transaction so the next write starts clean.
          await sql.execute('ROLLBACK').catch(() => undefined)
          throw e
        }
      }),
    script: (text) =>
      serial(async () => {
        await sql.execute(text)
      }),
  }
}

/** The schema version a database is at. */
export async function schemaVersion(sql: Pick<Sql, 'select'>): Promise<number> {
  const [row] = await sql.select<{ user_version: number }>('PRAGMA user_version')
  return row?.user_version ?? 0
}

/**
 * One string the plugin runs on one connection: its pool may give separate calls separate connections, so a
 * transaction must be a single call. Parameters are inlined as SQL literals for that.
 */
function transaction(statements: ReadonlyArray<string>): string {
  return ['BEGIN IMMEDIATE', ...statements.map((s) => s.trim().replace(/;\s*$/, '')), 'COMMIT']
    .map((s) => `${s};`)
    .join('\n')
}

/** A statement with its `?` parameters inlined, in order (a `?` inside a string literal is left alone). */
export function inline({ sql, params = [] }: Statement): string {
  let i = 0
  const out = sql.replace(/'(?:[^']|'')*'|\?/g, (token) => {
    if (token !== '?') return token
    if (i >= params.length) throw new Error(`Too few parameters for: ${sql}`)
    return literal(params[i++]!)
  })
  if (i !== params.length) throw new Error(`Too many parameters for: ${sql}`)
  return out
}

/** A value as a SQLite literal: numbers as written, text quoted with `''` for `'`. */
export function literal(value: SqlValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Not a storable number: ${value}`)
    return String(value)
  }
  if (value.includes('\0')) throw new Error('Text with a NUL character cannot be stored.')
  return `'${value.replaceAll("'", "''")}'`
}

/** `tauri-plugin-sql`'s database as {@link Sql}; loaded lazily, so tests never import the plugin. */
export async function tauriSql(path = 'sqlite:chess.db'): Promise<Sql> {
  const { default: Database } = await import('@tauri-apps/plugin-sql')
  const db = await Database.load(path)
  return {
    select: <T>(text: string, params: ReadonlyArray<SqlValue> = []) =>
      db.select<Array<T>>(text, [...params]),
    execute: async (text, params = []) => {
      const result = await db.execute(text, [...params])
      return { rowsAffected: result.rowsAffected }
    },
  }
}

/** A UUID v7 (D11): 48 bits of milliseconds, then random bits, so ids sort by creation time. */
export function newId(now: Date = new Date()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let ms = now.getTime()
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256
    ms = Math.floor(ms / 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
