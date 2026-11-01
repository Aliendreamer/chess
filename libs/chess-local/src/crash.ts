import { positionKey } from '@chess/core'
import type { Db } from './db.ts'
import type { EnginePriority } from './engine.ts'

/**
 * Surviving a Stockfish crash (mobile-app D13). On the phone Stockfish runs inside the app, so a crash closes it; the
 * native bridge leaves two files behind: the request marker (what the engine was asked last, written before each `go`
 * and removed on `bestmove`) and, only for a signal on the engine's thread, the crash record. On the next start the app
 * reads them (and removes them) and hands them here, before the engine is used.
 */

/** What the engine was asked, as the scheduler marks it (`# request {json}`). */
export interface EngineRequestMarker {
  kind: EnginePriority
  fen: string
}

/** Written by the bridge's signal handler: the signal, when, and the request it was serving. */
export interface EngineCrashRecord {
  signal: string
  at: string
  request: EngineRequestMarker | null
}

/** What the start-up notice says: Stockfish crashed while doing `kind` on `fen`. */
export interface CrashNotice {
  kind: EnginePriority | null
  fen: string | null
  signal: string
  at: string
}

/** Work the player did not ask for at that moment: it never asks a position that crashed the engine again. */
const BACKGROUND: ReadonlyArray<EnginePriority> = ['judgement', 'review', 'miner']

/** The position crashed the engine; background work skips it. */
export class PositionFailed extends Error {
  constructor(fen: string) {
    super(`The engine failed on this position before: ${fen}`)
  }
}

/**
 * The notice to show, or null. A marker without a crash record means the app was killed some other way (swiped away,
 * out of memory): nothing is shown and work resumes. A crash during background work records the position so it is
 * skipped from then on; for a game's move or the board, the player decides whether to ask again.
 */
export async function recoverFromCrash(
  db: Db,
  files: { crash: EngineCrashRecord | null; marker: EngineRequestMarker | null },
): Promise<CrashNotice | null> {
  const { crash } = files
  if (!crash) return null
  const request = crash.request
  if (request && BACKGROUND.includes(request.kind)) {
    await db.execute(
      'INSERT INTO engine_failures (position_key, kind, failed_at) VALUES (?, ?, ?) ON CONFLICT (position_key) DO NOTHING',
      [positionKey(request.fen), request.kind, crash.at],
    )
  }
  return {
    kind: request?.kind ?? null,
    fen: request?.fen ?? null,
    signal: crash.signal,
    at: crash.at,
  }
}

export async function isFailedPosition(db: Db, fen: string): Promise<boolean> {
  const rows = await db.select('SELECT 1 FROM engine_failures WHERE position_key = ?', [
    positionKey(fen),
  ])
  return rows.length > 0
}

/** Whether a request at `priority` is background work that must skip failed positions. */
export const isBackground = (priority: EnginePriority): boolean => BACKGROUND.includes(priority)
