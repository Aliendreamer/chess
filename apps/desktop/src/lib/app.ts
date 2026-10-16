import { levelOptions } from '@chess/core'
import { openDb, tauriSql } from './data/db'
import { ensureOpenings } from './data/openings'
import { AnalysisQueue, EngineSupervisor, sidecarChannel } from './engine'
import type { Db } from './data/db'
import type { EnginePlayer } from './data/play'

/**
 * What the pages work with (desktop-app D2): the database, the engine for games, the analysis queue, and the few things
 * only the shell can do. Created once at start and handed to the router as its context, so a test hands in fakes.
 */
export interface AppServices {
  db: Db
  /** The engine that plays the games, at the game's level. */
  player: EnginePlayer
  /** The full-strength engine: the board first, review and mining behind it. */
  analysis: AnalysisQueue
  /** Status of the two engine processes, for "engine restarting". */
  engines: { play: EngineSupervisor; analysis: EngineSupervisor }
  /** Asks where to save `text` (a PGN), then writes it; false when the person cancels. */
  saveText: (defaultName: string, text: string) => Promise<boolean>
  /** Asks for a text file to read (a PGN); null when the person cancels. */
  openText: (extensions: ReadonlyArray<string>) => Promise<string | null>
  /** Opens a link in the system browser, never inside the app. */
  openLink: (url: string) => Promise<void>
}

export interface RouterContext {
  app: AppServices
}

/** The real services: the SQLite file, two Stockfish processes, and the dialog, file and opener plugins. */
export async function startServices(): Promise<AppServices> {
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  // The plugin keeps `sqlite:chess.db` in the app data directory; the copy before a migration goes beside it.
  const file = await join(await appDataDir(), 'chess.db')
  const db = await openDb(await tauriSql('sqlite:chess.db'), (v) => `${file}.before-v${v}`)
  await ensureOpenings(db)
  const play = new EngineSupervisor(sidecarChannel)
  const analysis = new EngineSupervisor(sidecarChannel)
  return {
    db,
    player: {
      bestMove: (fen, level, thinkMs) =>
        play.run((engine) => engine.bestMove(fen, levelOptions(level), thinkMs)),
    },
    analysis: new AnalysisQueue(analysis),
    engines: { play, analysis },
    saveText: async (defaultName, text) => {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const path = await save({ defaultPath: defaultName })
      if (!path) return false
      await writeTextFile(path, text)
      return true
    },
    openText: async (extensions) => {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const path = await open({
        multiple: false,
        filters: [{ name: 'PGN', extensions: [...extensions] }],
      })
      return typeof path === 'string' ? readTextFile(path) : null
    },
    openLink: async (url) => {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    },
  }
}
