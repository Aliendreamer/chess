import type { EngineCrashRecord, EngineRequestMarker, UciChannel } from '@chess/local'
import type { StockfishEvents } from '../../modules/stockfish'

/** What the app needs of the native module (`modules/stockfish`); tests pass a stand-in. */
export interface StockfishNative {
  start: () => Promise<boolean>
  send: (line: string) => void
  quit: () => Promise<void>
  takeCrashFiles: () => { crash: string | null; marker: string | null }
  addListener: <E extends keyof StockfishEvents>(
    event: E,
    listener: StockfishEvents[E],
  ) => { remove: () => void }
}

/** The bundled module, loaded on first use so tests and the bundle check never need the native side. */
function bundled(): StockfishNative {
  // Lazy on purpose: importing it at the top would call requireNativeModule('Stockfish') where there is none (tests).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('../../modules/stockfish') as { default: StockfishNative }).default
}

/**
 * Stockfish inside the app as `@chess/local`'s {@link UciChannel} (mobile-app D6): `write` → `send`, each batch's
 * lines → `onLine` in order, `exit` → `onExit`, `kill` → `quit`. One engine at a time (Stockfish's state is
 * process-wide): a second start is refused.
 */
export async function nativeChannel(module: StockfishNative = bundled()): Promise<UciChannel> {
  const lineListeners: Array<(line: string) => void> = []
  const exitListeners: Array<() => void> = []
  let ended = false
  const lines = module.addListener('lines', ({ lines: batch }) => {
    if (!ended) for (const line of batch) lineListeners.forEach((l) => l(line))
  })
  const exit = module.addListener('exit', () => {
    if (ended) return
    ended = true
    lines.remove()
    exit.remove()
    exitListeners.forEach((l) => l())
  })
  if (!(await module.start())) {
    lines.remove()
    exit.remove()
    throw new Error('Stockfish is already running.')
  }
  return {
    write: (line) => {
      module.send(line)
      return Promise.resolve()
    },
    onLine: (listener) => void lineListeners.push(listener),
    onExit: (listener) => void exitListeners.push(listener),
    kill: () => module.quit(),
  }
}

/**
 * What the last run left (mobile-app D13), read and removed by the module: the crash record (its time as ISO) and the
 * request marker, for `@chess/local`'s `recoverFromCrash`. A file that does not parse counts as absent.
 */
export function takeCrashFiles(module: StockfishNative = bundled()): {
  crash: EngineCrashRecord | null
  marker: EngineRequestMarker | null
} {
  const files = module.takeCrashFiles()
  const crash = parse<{ signal: string; atMs: number; request: EngineRequestMarker | null }>(
    files.crash,
  )
  return {
    crash: crash
      ? { signal: crash.signal, at: new Date(crash.atMs).toISOString(), request: crash.request }
      : null,
    marker: parse<EngineRequestMarker>(files.marker),
  }
}

function parse<T>(text: string | null): T | null {
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
