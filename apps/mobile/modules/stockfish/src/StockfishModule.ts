import { NativeModule, requireNativeModule } from 'expo'

/**
 * Stockfish 19 inside the app (mobile-app D6): a line carrier with no chess in it. `send` queues one UCI line, `lines`
 * brings the engine's output in batches (the last `info` per multipv every ~50 ms; anything else at once), `exit` says
 * the engine ended. `takeCrashFiles` hands over, once, what a crash left (D13).
 */
export type StockfishEvents = {
  lines: (event: { lines: Array<string> }) => void
  exit: (event: { reason: 'quit' | 'error'; message?: string }) => void
}

declare class StockfishModule extends NativeModule<StockfishEvents> {
  /** Starts the engine thread; false when one is running. */
  start(): Promise<boolean>
  send(line: string): void
  /** Sends `quit` and resolves when the engine thread has ended (on a thread of its own, never the module queue). */
  quit(): Promise<void>
  takeCrashFiles(): { crash: string | null; marker: string | null }
}

export default requireNativeModule<StockfishModule>('Stockfish')
