import { levelOptions } from '@chess/core'
import { openDb, tauriSql } from './data/db'
import { ensureBundledLibrary } from './data/bundled'
import { ensureOpenings } from './data/openings'
import { AnalysisQueue, EngineSupervisor, sidecarChannel } from './engine'
import { Evaluator } from './data/analysis'
import { reviewsToRun, runReview } from './data/review'
import { getSetting } from './data/settings'
import { mineRound } from './data/training'
import { EVENTS_EVERY_MS, NEWS_EVERY_MS, eventsRound, newsRound } from './data/news'
import type { Db, Sql } from './data/db'
import type { EnginePlayer } from './data/play'
import type { FetchText } from './data/news'

/** How often the miner looks for critical moments in the library. */
const MINE_EVERY_MS = 10_000

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
  /** Evaluations from the store, or asked of the analysis engine once. */
  evaluator: Evaluator
  /** Status of the two engine processes, for "engine restarting". */
  engines: { play: EngineSupervisor; analysis: EngineSupervisor }
  /** Asks where to save `text` (a PGN), then writes it; false when the person cancels. */
  saveText: (defaultName: string, text: string) => Promise<boolean>
  /** Asks for a text file to read (a PGN); null when the person cancels. */
  openText: (extensions: ReadonlyArray<string>) => Promise<string | null>
  /** Opens a link in the system browser, never inside the app. */
  openLink: (url: string) => Promise<void>
  /** A GET to a news source (the capability's allow-list decides which hosts). */
  fetchText: FetchText
  /** Backup and restore (D10): where to write a backup, which file to restore, and opening that file on its own. */
  backups: {
    chooseSave: (defaultName: string) => Promise<string | null>
    chooseOpen: () => Promise<string | null>
    open: (path: string) => Promise<Sql & { close?: () => Promise<void> | void }>
    /** Where the current data is kept before a restore replaces it. */
    asidePath: () => Promise<string>
  }
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
  const queue = new AnalysisQueue(analysis)
  const evaluator = new Evaluator(db, queue)
  // Reviews left unfinished (the app closed while one ran, or a game ended without one) run again, behind the board.
  void (async () => {
    for (const id of await reviewsToRun(db))
      await runReview(db, evaluator, id).catch(() => undefined)
  })()
  // The miner (training D3): a round every little while, behind the board and the reviews; off in Settings.
  const mine = async () => {
    if ((await getSetting(db, 'training.miner', true)) && queue.pending('background') === 0)
      await mineRound(db, evaluator).catch(() => undefined)
    setTimeout(() => void mine(), MINE_EVERY_MS)
  }
  // The bundled library (desktop-app D12) loads behind the first screen; the miner starts after it, so it never asks
  // a position the club's Stockfish has already judged.
  void ensureBundledLibrary(db)
    .catch(() => undefined)
    .then(() => setTimeout(() => void mine(), MINE_EVERY_MS))
  // News (desktop-app D7): fetched while the app runs; a round that fails (offline) leaves what is kept.
  const fetchText: FetchText = async (url, headers) => {
    const { fetch } = await import('@tauri-apps/plugin-http')
    const answer = await fetch(url, { method: 'GET', headers, connectTimeout: 10_000 })
    return { status: answer.status, text: await answer.text() }
  }
  const every = (ms: number, round: () => Promise<unknown>) => {
    const run = () =>
      void round()
        .catch(() => undefined)
        .finally(() => setTimeout(run, ms))
    setTimeout(run, 3_000)
  }
  every(NEWS_EVERY_MS, () => newsRound(db, fetchText))
  every(EVENTS_EVERY_MS, () => eventsRound(db, fetchText))
  return {
    db,
    fetchText,
    player: {
      bestMove: (fen, level, thinkMs) =>
        play.run((engine) => engine.bestMove(fen, levelOptions(level), thinkMs)),
    },
    analysis: queue,
    evaluator,
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
    backups: {
      chooseSave: async (defaultName) => {
        const { save } = await import('@tauri-apps/plugin-dialog')
        return save({
          defaultPath: defaultName,
          filters: [{ name: 'Chess backup', extensions: ['chessbackup'] }],
        })
      },
      chooseOpen: async () => {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const path = await open({
          multiple: false,
          filters: [{ name: 'Chess backup', extensions: ['chessbackup'] }],
        })
        return typeof path === 'string' ? path : null
      },
      open: async (path) => {
        const { default: Database } = await import('@tauri-apps/plugin-sql')
        const other = await Database.load(`sqlite:${path}`)
        return {
          select: <T,>(text: string, params: ReadonlyArray<string | number | null> = []) =>
            other.select<Array<T>>(text, [...params]),
          execute: async (text, params = []) => ({
            rowsAffected: (await other.execute(text, [...params])).rowsAffected,
          }),
          close: async () => {
            await other.close()
          },
        }
      },
      asidePath: () => Promise.resolve(`${file}.before-restore-${Date.now()}`),
    },
    openLink: async (url) => {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    },
  }
}
