import { levelOptions } from '@chess/core'
import {
  EVENTS_EVERY_MS,
  EngineScheduler,
  EngineSupervisor,
  Evaluator,
  NEWS_EVERY_MS,
  ensureBundledLibrary,
  ensureOpenings,
  eventsRound,
  getSetting,
  mineRound,
  newsRound,
  openDb,
  recoverFromCrash,
  reviewsToRun,
  runReview,
} from '@chess/local'
import type {
  CrashNotice,
  Db,
  EngineCrashRecord,
  EnginePlayer,
  EngineRequestMarker,
  FetchText,
  LocalAssets,
  Sql,
  UciChannel,
} from '@chess/local'

/** The phone's side of everything (mobile-app D1, D8, D9, D13); src/lib/app.ts supplies the real one. */
export interface Platform {
  sql: Sql
  /** Where a copy of the database goes before a migration. */
  backupPath: (fromVersion: number) => string
  channel: () => Promise<UciChannel>
  assets: LocalAssets
  fetchText: FetchText
  openLink: (url: string) => Promise<void>
  appState: {
    addEventListener: (type: 'change', listener: (state: string) => void) => { remove: () => void }
  }
  /** What the last run left (read and removed once). */
  crashFiles: () => { crash: EngineCrashRecord | null; marker: EngineRequestMarker | null }
}

export interface MobileServices {
  db: Db
  /** The one engine's requests: game, board, judgement, review, miner (D7). */
  scheduler: EngineScheduler
  /** The engine's state, for "restarting" and "stopped responding". */
  engine: EngineSupervisor
  evaluator: Evaluator
  player: EnginePlayer
  fetchText: FetchText
  openLink: (url: string) => Promise<void>
  /** The start-up notice when Stockfish crashed the last run (D13), or null. */
  crash: CrashNotice | null
  /** The bundled library's first load (D9), behind the first screen. */
  library: Promise<{ state: 'loaded' | 'current'; games: number } | null>
  /** Whether the miner runs: off on the phone until the player turns it on (D8). */
  minerOn: () => Promise<boolean>
  dispose: () => void
}

const MINE_EVERY_MS = 10_000
/** The first news round, a little after the start. */
const FIRST_ROUND_MS = 3_000

/**
 * The services the screens use. The crash record is turned into a notice before the engine is asked anything; then
 * the openings, the engine (one Stockfish, marked for the crash record), reviews left unfinished, the bundled library
 * and, behind it, the miner. Work runs only while the app is in front: in the background the engine holds and the
 * timers stop (the system may suspend the app), and both resume when it returns.
 */
export async function startServices(platform: Platform): Promise<MobileServices> {
  const db = await openDb(platform.sql, platform.backupPath)
  const crash = await recoverFromCrash(db, platform.crashFiles())
  await ensureOpenings(db, platform.assets.openings)

  const engine = new EngineSupervisor(platform.channel)
  const scheduler = new EngineScheduler({ analysis: engine }, { markRequests: true })
  const evaluator = new Evaluator(db, scheduler)
  const minerOn = () => getSetting(db, 'training.miner', false)

  // Every background round, by name: stopped in the background, started again in front.
  const rounds = new Map<string, { every: number; run: () => Promise<unknown> }>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let inFront = true
  let disposed = false
  const schedule = (name: string, delay: number) => {
    const round = rounds.get(name)
    if (!round || !inFront || disposed) return
    timers.set(
      name,
      setTimeout(() => {
        timers.delete(name)
        void round
          .run()
          .catch(() => undefined)
          .finally(() => schedule(name, round.every))
      }, delay),
    )
  }
  const stopAll = () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
  const startAll = () => {
    for (const name of rounds.keys()) if (!timers.has(name)) schedule(name, FIRST_ROUND_MS)
  }

  rounds.set('news', { every: NEWS_EVERY_MS, run: () => newsRound(db, platform.fetchText) })
  rounds.set('events', { every: EVENTS_EVERY_MS, run: () => eventsRound(db, platform.fetchText) })
  startAll()

  // Reviews left unfinished run again, behind the board; held with the engine in the background.
  void (async () => {
    for (const id of await reviewsToRun(db))
      await runReview(db, evaluator, id).catch(() => undefined)
  })()

  // The bundled library loads behind the first screen; the miner starts after it.
  const library = ensureBundledLibrary(db, platform.assets.bundledLibrary)
    .catch(() => null)
    .then((loaded) => {
      rounds.set('miner', {
        every: MINE_EVERY_MS,
        run: async () => {
          if ((await minerOn()) && scheduler.pending('review') + scheduler.pending('miner') === 0)
            await mineRound(db, evaluator)
        },
      })
      schedule('miner', MINE_EVERY_MS)
      return loaded
    })

  const subscription = platform.appState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (inFront) return
      inFront = true
      scheduler.resume()
      startAll()
    } else if (state === 'background') {
      if (!inFront) return
      inFront = false
      void scheduler.hold()
      stopAll()
    }
  })

  return {
    db,
    scheduler,
    engine,
    evaluator,
    player: {
      bestMove: (fen, level, thinkMs) => scheduler.bestMove(fen, levelOptions(level), thinkMs),
    },
    fetchText: platform.fetchText,
    openLink: platform.openLink,
    crash,
    library,
    minerOn,
    dispose: () => {
      disposed = true
      stopAll()
      subscription.remove()
      void engine.shutdown()
    },
  }
}
