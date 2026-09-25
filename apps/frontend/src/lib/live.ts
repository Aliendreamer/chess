/**
 * The live wire contract, shared by the SSR relay and the browser. Kind-agnostic: a frame is `{ topic, seq,
 * payload }` for any live kind (ping now, game later); each page narrows `payload` for its own kind.
 *
 * Deliberately outside `lib/server/`: the client bundle imports this, and nothing under `lib/server/` may ever
 * reach the browser.
 */

/** Mirrors the API's `LiveFrame` (System.Text.Json camel-cases the members). */
export interface LiveFrame<TPayload = unknown> {
  topic: string
  seq: number
  payload: TPayload
}

/** What travels over the browser ↔ BFF socket. */
export type SocketMessage = { kind: 'frame'; frame: LiveFrame } | { kind: 'error'; message: string }

export function isLiveFrame(value: unknown): value is LiveFrame {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['topic'] === 'string' && typeof v['seq'] === 'number' && 'payload' in v
}

/** Socket text → message. Junk is dropped, never thrown: a bad message must not kill the feed. */
export function parseSocketMessage(data: string): SocketMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const m = parsed as Record<string, unknown>
  if (m['kind'] === 'frame' && isLiveFrame(m['frame'])) return { kind: 'frame', frame: m['frame'] }
  if (m['kind'] === 'error' && typeof m['message'] === 'string') {
    return { kind: 'error', message: m['message'] }
  }
  return null
}

/**
 * The view only moves forward: a frame applies when its seq is newer than what is shown. A snapshot and a push for
 * the same event may arrive in either order, and a reconnect may repeat one; both collapse here.
 */
export function applyFrame<TPayload>(
  current: LiveFrame<TPayload> | undefined,
  next: LiveFrame<TPayload>,
): LiveFrame<TPayload> {
  return current === undefined || next.seq > current.seq ? next : current
}
