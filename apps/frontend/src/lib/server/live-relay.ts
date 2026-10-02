import WebSocket from 'ws'
import { CLOSE_BAD_TOPIC, CLOSE_UNAUTHENTICATED, LIVE_KINDS, liveTopic } from '../live'
import { loadMe } from './auth'
import { apiUrl, clientIp, forwardClientIp, relayRevalidateMs } from './upstream'
import { liveMultiplexer } from './live-hub'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { bffMetrics } from './telemetry'
import type { LiveKind } from '../live'
import type { HubMultiplexer, LocalSocket } from './live-hub'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { Plugin } from 'vite'

/**
 * The browser side of the live relay (browser ↔ `app.` ↔ one shared hub connection ↔ backend `/hub/live`), shared by
 * both hosts: the Nitro route in the built server and the Vite plugin in dev. The hosts only adapt sockets; the
 * decisions — which topics exist, who may watch, when to stop — live here and are unit-tested.
 */

export const LIVE_PREFIX = '/api/ws/live/'

export const BAD_TOPIC = CLOSE_BAD_TOPIC
export const UNAUTHENTICATED = CLOSE_UNAUTHENTICATED

/** Each live kind's backend id rule (kept in sync by tests, not imports); the type makes every kind have one. */
const KINDS: Record<LiveKind, RegExp> = {
  ping: /^[a-z0-9-]{1,64}$/, // PingIds.Pattern
  game: /^[0-9a-f]{32}$/, // GameLiveSource: a Guid v7 in N form (ROADMAP D11)
  queue: /^\d{1,2}\+\d{1,2}$/, // QueueLiveSource: a time control; the backend checks it is a preset
  invite: /^[0-9a-f]{32}$/, // InviteLiveSource: a random Guid v4 in N form
}

const isLiveKind = (kind: string): kind is LiveKind =>
  (LIVE_KINDS as ReadonlyArray<string>).includes(kind)

export interface LiveTarget {
  kind: LiveKind
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
  if (!isLiveKind(kind)) return null
  return KINDS[kind].test(id) ? { kind, id, topic: liveTopic(kind, id) } : null
}

export interface RelayDeps {
  mux: HubMultiplexer
  revalidateMs: number
  /** The session's user id, or null for none/revoked; throws when the backend can't be asked. */
  sessionUser: (cookie: string, ip: string | null) => Promise<number | null>
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
  ip: string | null = null,
): RelayHandle {
  let closed = false
  let subscribed = false
  let userId: number | undefined
  let timer: ReturnType<typeof setInterval> | null = null

  async function stop(): Promise<void> {
    if (timer !== null) deps.clearInterval(timer)
    timer = null
    if (subscribed) {
      subscribed = false
      bffMetrics.socketClosed()
      await deps.mux.unsubscribe(target.topic, socket, userId)
    }
  }

  async function open(): Promise<void> {
    if (!cookie) {
      bffMetrics.refused(UNAUTHENTICATED)
      socket.close(UNAUTHENTICATED, 'unauthenticated')
      return
    }
    const user = await deps.sessionUser(cookie, ip)
    if (closed) return
    if (user === null) {
      bffMetrics.refused(UNAUTHENTICATED)
      socket.close(UNAUTHENTICATED, 'unauthenticated')
      return
    }
    subscribed = true
    bffMetrics.socketOpened()
    userId = user
    timer = deps.setInterval(async () => {
      const stillValid = await deps
        .sessionUser(cookie, ip)
        .then((u) => u !== null)
        .catch(() => true)
      if (stillValid || closed) return
      await stop()
      socket.close(UNAUTHENTICATED, 'session ended')
    }, deps.revalidateMs)
    await deps.mux.subscribe(target.topic, socket, user)
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
    sessionUser: async (cookie, ip) =>
      (
        await loadMe((input, init) => {
          const headers = new Headers(init?.headers)
          headers.set('cookie', cookie)
          headers.set('accept', 'application/json')
          forwardClientIp(headers, ip)
          const url = typeof input === 'string' ? `${base}${input}` : input
          return fetch(url, { ...init, headers })
        })
      )?.id ?? null,
    setInterval: (fn, ms) => setInterval(() => void fn(), ms),
    clearInterval: (handle) => clearInterval(handle),
  }
}

// ws is pinned at 7.x because @microsoft/signalr requires it, and 7.x is CommonJS: a named import
// (`{ Server }`) resolves in TypeScript but throws under Node's ESM loader, so take the default.

/**
 * The live relay for `vite dev`. The Nitro plugin only runs on `build`, so the scanned handler in
 * `server/routes/api/ws/live/[kind]/[id].ts` does not exist in dev — without this, a developer (and the Playwright
 * specs, which run against the dev container) get a page that never leaves "connecting…". Both hosts share
 * `openRelay`; only the socket plumbing differs.
 */
export function devLiveRelay(): Plugin {
  return {
    name: 'chess:dev-live-relay',
    apply: 'serve',
    configureServer(server) {
      const sockets = new WebSocket.Server({ noServer: true })

      server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const url = request.url ?? ''
        // Not ours: leave the socket untouched so Vite's HMR upgrade still gets it.
        if (!url.startsWith(LIVE_PREFIX)) return

        sockets.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          const target = parseLiveUrl(url)
          if (!target) {
            bffMetrics.refused(BAD_TOPIC)
            ws.close(BAD_TOPIC, 'unknown live topic')
            return
          }
          const cookie = forwardCookieHeader(request.headers.cookie, cookiesAreSecure())
          const relay = openRelay(
            target,
            cookie,
            { send: (data) => ws.send(data), close: (code, reason) => ws.close(code, reason) },
            relayDeps(),
            clientIp(
              [request.headers['x-forwarded-for']].flat().join(','),
              request.socket.remoteAddress,
            ),
          )
          ws.on('close', () => void relay.close())
          ws.on('error', () => void relay.close())
        })
      })
    },
  }
}
