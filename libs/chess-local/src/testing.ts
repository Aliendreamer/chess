import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { Sql, SqlValue } from './db.ts'
import type { UciChannel } from './engine.ts'

/** Test helpers on Node (`@chess/local/testing`): never imported by an app's own code. */

/** An in-memory SQLite behind the same interface as the plugin (desktop-app D9): node's own driver, no native build. */
export function memorySql(path = ':memory:'): Sql & { close: () => void } {
  const db = new DatabaseSync(path)
  return {
    select: <T>(sql: string, params: ReadonlyArray<SqlValue> = []) =>
      Promise.resolve(db.prepare(sql).all(...params) as Array<T>),
    execute: (sql: string, params: ReadonlyArray<SqlValue> = []) => {
      // Several statements (a migration, a batch) run as a script; one with parameters as a prepared statement.
      if (params.length === 0) {
        const before = db.prepare('SELECT total_changes() AS n').get() as {
          n: number
        }
        db.exec(sql)
        const after = db.prepare('SELECT total_changes() AS n').get() as {
          n: number
        }
        return Promise.resolve({ rowsAffected: after.n - before.n })
      }
      return Promise.resolve({
        rowsAffected: Number(db.prepare(sql).run(...params).changes),
      })
    },
    close: () => {
      if (db.isOpen) db.close()
    },
  }
}

/** A real engine process as a UCI channel, for the tests that run the fetched Stockfish when it is there. */
export async function processChannel(path: string): Promise<UciChannel> {
  const { spawn } = await import('node:child_process')
  const child = spawn(path, [], { stdio: ['pipe', 'pipe', 'ignore'] })
  const lineListeners: Array<(line: string) => void> = []
  const exitListeners: Array<() => void> = []
  let buffered = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() ?? ''
    for (const line of lines) if (line !== '') lineListeners.forEach((l) => l(line))
  })
  child.on('exit', () => exitListeners.forEach((l) => l()))
  return {
    write: (line) =>
      new Promise((resolve, reject) =>
        child.stdin.write(`${line}\n`, (e) => (e ? reject(e) : resolve())),
      ),
    onLine: (listener) => lineListeners.push(listener),
    onExit: (listener) => exitListeners.push(listener),
    kill: () => {
      child.kill()
      return Promise.resolve()
    },
  }
}

/** The openings list as the apps bundle it: the backend's TSV files, read from the repository. */
export function openingFiles(): Promise<Array<string>> {
  const dir = join(import.meta.dirname, '../../../apps/backend/Library/Openings')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.tsv'))
    .sort()
  return Promise.resolve(files.map((f) => readFileSync(join(dir, f), 'utf8')))
}
