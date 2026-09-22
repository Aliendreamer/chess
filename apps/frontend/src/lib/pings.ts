/**
 * The ping wire contract, shared by the SSR relay and the browser component.
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

/** What travels over the relay socket. */
export type Frame = { kind: 'state'; state: PingState } | { kind: 'error'; message: string }

export function isPingState(value: unknown): value is PingState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['pingId'] === 'string' && typeof v['count'] === 'number'
}

/** Socket text → frame. Junk is dropped, never thrown: a bad frame must not kill the feed. */
export function parseFrame(data: string): Frame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const frame = parsed as Record<string, unknown>
  if (frame['kind'] === 'state' && isPingState(frame['state'])) {
    return { kind: 'state', state: frame['state'] }
  }
  if (frame['kind'] === 'error' && typeof frame['message'] === 'string') {
    return { kind: 'error', message: frame['message'] }
  }
  return null
}
