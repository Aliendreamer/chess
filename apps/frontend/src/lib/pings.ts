/**
 * The ping payload, as it arrives inside a live frame (`lib/live.ts`) and from the loaders.
 *
 * Deliberately outside `lib/server/`: the client bundle imports this, and nothing under `lib/server/`
 * may ever reach the browser.
 */

/** Mirrors the API's `PingState` record (System.Text.Json camel-cases the members). */
export interface PingState {
  pingId: string
  count: number
  lastText: string | null
  lastAt: string | null
  lastSeq: number
}

export function isPingState(value: unknown): value is PingState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['pingId'] === 'string' && typeof v['count'] === 'number'
}
