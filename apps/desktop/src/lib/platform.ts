import type { Sql, SqlValue, UciChannel } from '@chess/local'

/**
 * The desktop's side of `@chess/local`'s interfaces (mobile-app D1): SQLite through `tauri-plugin-sql`, Stockfish as
 * the Tauri sidecar, and the shipped files through Vite's asset imports. Each loads its plugin lazily, so tests never
 * import one.
 */

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

/** The bundled Stockfish as a {@link UciChannel}, through Tauri's shell plugin; loaded lazily, so tests never import it. */
export async function sidecarChannel(): Promise<UciChannel> {
  const { Command } = await import('@tauri-apps/plugin-shell')
  const command = Command.sidecar('binaries/stockfish')
  const lineListeners: Array<(line: string) => void> = []
  const exitListeners: Array<() => void> = []
  command.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) if (line !== '') lineListeners.forEach((l) => l(line))
  })
  command.on('close', () => exitListeners.forEach((l) => l()))
  command.on('error', () => exitListeners.forEach((l) => l()))
  const child = await command.spawn()
  return {
    write: (line) => child.write(`${line}\n`),
    onLine: (listener) => lineListeners.push(listener),
    onExit: (listener) => exitListeners.push(listener),
    kill: () => child.kill(),
  }
}

/** The list as bundled: the backend's TSV files, read lazily so they stay out of the first screen's code. */
export async function embeddedOpenings(): Promise<Array<string>> {
  const files = import.meta.glob<string>('../../../backend/Library/Openings/*.tsv', {
    query: '?raw',
    import: 'default',
  })
  return Promise.all(
    Object.keys(files)
      .sort()
      .map((path) => files[path]!()),
  )
}

/** The file as shipped, gzipped; fetched lazily so it stays out of the first screen's code. */
export async function embeddedLibrary(): Promise<Uint8Array<ArrayBuffer>> {
  const { default: url } = await import('../../library/library.json.gz?url')
  return new Uint8Array(await (await fetch(url)).arrayBuffer())
}
