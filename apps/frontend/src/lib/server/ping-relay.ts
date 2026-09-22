/**
 * The pure half of the SSR WebSocket relay (browser ↔ app. ↔ SignalR ↔ backend hub).
 *
 * Everything here is transport-free so it can be unit-tested without a socket: the Nitro handler in
 * `server/routes/api/ws/pings/[id].ts` owns the I/O and calls into these. The wire types live in
 * `#/lib/pings` because the browser component shares them.
 */
import { isPingState } from '../pings'
import type { Frame, PingState } from '../pings'

export type { Frame, PingState }

/** Backend contract: `PingIds.Pattern`. Kept in sync by the tests, not by an import. */
const PING_ID = /^[a-z0-9-]{1,64}$/

/** Hub invocation → a frame, or null for anything we do not relay. */
export function mapHubMessage(method: string, args: ReadonlyArray<unknown>): Frame | null {
  if (method !== 'state' || args.length === 0) return null
  const [state] = args
  return isPingState(state) ? { kind: 'state', state } : null
}

/** Last path segment of the relay URL, validated against the backend's id rules (else null). */
export function pingIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let pathname: string
  try {
    pathname = new URL(url, 'http://relay.invalid').pathname
  } catch {
    return null
  }
  const id = pathname.split('/').pop()
  return id && PING_ID.test(id) ? id : null
}
