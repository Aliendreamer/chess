import { loadMe } from './api-loaders'
import { apiUrl, relayRevalidateMs } from './config'
import { liveMultiplexer } from './live-hub'
import type { HubMultiplexer, LocalSocket } from './hub-multiplexer'

/**
 * The browser side of the live relay (browser ↔ `app.` ↔ one shared hub connection ↔ backend `/hub/live`), shared by
 * both hosts: the Nitro route in the built server and the Vite plugin in dev. The hosts only adapt sockets; the
 * decisions — which topics exist, who may watch, when to stop — live here and are unit-tested.
 */

export const LIVE_PREFIX = '/api/ws/live/'

/** Unknown kind or an id that fails the kind's rule. */
export const BAD_TOPIC = 4400
/** No session, or the session ended while watching. (1000–1015 are reserved by the protocol.) */
export const UNAUTHENTICATED = 4401

/** The kinds the BFF relays, each with its backend id rule (kept in sync by tests, not imports). */
const KINDS: Record<string, RegExp> = {
  ping: /^[a-z0-9-]{1,64}$/, // PingIds.Pattern
  game: /^[0-9a-f]{32}$/, // GameLiveSource: a Guid v7 in N form (ROADMAP D11)
}

export interface LiveTarget {
  kind: string
  id: string
  topic: string
}

/** `/api/ws/live/{kind}/{id}` → target, or null for anything not on the allow-list. */
export function parseLiveUrl(url: string | null | undefined): LiveTarget | null {
  if (!url) return null
  let pathname: string
  try {
    pathname = new URL(url, 'http://relay.invalid').pathname
  } catch {
    return null
  }
  if (!pathname.startsWith(LIVE_PREFIX)) return null
  const parts = pathname.slice(LIVE_PREFIX.length).split('/')
  if (parts.length !== 2) return null
  const [kind, id] = parts as [string, string]
  const rule = Object.hasOwn(KINDS, kind) ? KINDS[kind] : undefined
  return rule?.test(id) ? { kind, id, topic: `${kind}:${id}` } : null
}

export interface RelayDeps {
  mux: HubMultiplexer
  revalidateMs: number
  /** True for a live session, false for none/revoked; throws when the backend can't be asked. */
  isSessionValid: (cookie: string) => Promise<boolean>
  setInterval: (fn: () => Promise<void>, ms: number) => ReturnType<typeof setInterval>
  clearInterval: (handle: ReturnType<typeof setInterval>) => void
}

export interface RelayHandle {
  /** Settles once the socket is subscribed or turned away. */
  ready: Promise<void>
  /** Call from the host's close/error handler; safe before `ready` settles. */
  close: () => Promise<void>
}

/**
 * Authorizes the browser by its session cookie (`GET /api/me`), subscribes it to the shared connection, and re-checks
 * the session every `revalidateMs` so a logout elsewhere ends the feed. A re-check that can't reach the backend keeps
 * the feed: a backend blip must not disconnect every viewer.
 */
export function openRelay(
  target: LiveTarget,
  cookie: string | null,
  socket: LocalSocket,
  deps: RelayDeps,
): RelayHandle {
  let closed = false
  let subscribed = false
  let timer: ReturnType<typeof setInterval> | null = null

  async function stop(): Promise<void> {
    if (timer !== null) deps.clearInterval(timer)
    timer = null
    if (subscribed) {
      subscribed = false
      await deps.mux.unsubscribe(target.topic, socket)
    }
  }

  async function open(): Promise<void> {
    if (!cookie) {
      socket.close(UNAUTHENTICATED, 'unauthenticated')
      return
    }
    const valid = await deps.isSessionValid(cookie)
    if (closed) return
    if (!valid) {
      socket.close(UNAUTHENTICATED, 'unauthenticated')
      return
    }
    subscribed = true
    timer = deps.setInterval(async () => {
      const stillValid = await deps.isSessionValid(cookie).catch(() => true)
      if (stillValid || closed) return
      await stop()
      socket.close(UNAUTHENTICATED, 'session ended')
    }, deps.revalidateMs)
    await deps.mux.subscribe(target.topic, socket)
  }

  const ready = open().catch(() => {
    socket.close(1011, 'session check failed')
  })
  return {
    ready,
    close: async () => {
      closed = true
      await stop()
    },
  }
}

/** Production wiring: the process-wide multiplexer and a `/api/me` check with the forwarded cookie. */
export function relayDeps(): RelayDeps {
  const base = apiUrl()
  return {
    mux: liveMultiplexer(),
    revalidateMs: relayRevalidateMs(),
    isSessionValid: async (cookie) =>
      (await loadMe((input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('cookie', cookie)
        headers.set('accept', 'application/json')
        const url = typeof input === 'string' ? `${base}${input}` : input
        return fetch(url, { ...init, headers })
      })) !== null,
    setInterval: (fn, ms) => setInterval(() => void fn(), ms),
    clearInterval: (handle) => clearInterval(handle),
  }
}
