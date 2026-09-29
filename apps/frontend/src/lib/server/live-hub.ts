import { HttpTransportType, HubConnectionBuilder } from '@microsoft/signalr'
import { isLiveFrame } from '../live'
import { apiUrl, keycloakTokenUrl, relayClient } from './upstream'
import { bffMetrics, pushFrame, withoutTrace } from './telemetry'
import type { LiveFrame, SocketMessage } from '../live'

/**
 * One backend hub connection per SSR process, shared by every browser socket (ROADMAP D5). Topics are
 * reference-counted: the first local subscriber joins the backend group, the last one leaves it. Every subscriber
 * gets its own snapshot from `Subscribe`; pushes fan out by `frame.topic`. On `game:` topics it also reports each
 * signed-in user's presence (presence-and-abandonment D1–D2). Transport-injected (`HubPort`) so all of it is
 * unit-tested without SignalR; `signalRPort` below is the real one.
 */

/** A browser socket, as the relay host exposes it. */
export interface LocalSocket {
  send: (data: string) => void
  close: (code: number, reason: string) => void
}

/** The slice of a SignalR connection the multiplexer needs. */
export interface HubPort {
  start: () => Promise<void>
  invoke: <T>(method: string, ...args: Array<unknown>) => Promise<T>
  onFrame: (handler: (frame: LiveFrame) => void) => void
  onReconnected: (handler: () => void) => void
  /** Final close: automatic reconnect has given up. */
  onClose: (handler: () => void) => void
  stop: () => Promise<void>
}

export interface HubMultiplexer {
  /** `userId` is the socket's signed-in user; on `game:` topics it drives presence reporting. */
  subscribe: (topic: string, socket: LocalSocket, userId?: number) => Promise<void>
  unsubscribe: (topic: string, socket: LocalSocket, userId?: number) => Promise<void>
  topicCount: () => number
}

export interface PresenceOptions {
  /** This SSR process's id for the backend's presence lease (D2): fixed for the process, unlike a connection id. */
  instance: string
  /** How often every held presence is re-sent; the backend expires one not refreshed within 75 s. */
  refreshMs: number
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>
  clearInterval: (handle: ReturnType<typeof setInterval>) => void
}

/** 1011: the hub is unavailable (protocol "internal error"). */
export const HUB_UNAVAILABLE = 1011

const PRESENCE_KIND = 'game:'

const send = (socket: LocalSocket, message: SocketMessage) =>
  socket.send(
    JSON.stringify(
      message.kind === 'frame' ? { ...message, frame: withoutTrace(message.frame) } : message,
    ),
  )

const defaultPresence = (): PresenceOptions => ({
  instance: crypto.randomUUID(),
  refreshMs: 30_000,
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle),
})

export function createHubMultiplexer(
  connect: () => HubPort,
  presenceOptions: PresenceOptions = defaultPresence(),
): HubMultiplexer {
  const topics = new Map<string, Set<LocalSocket>>()
  let port: HubPort | null = null
  let starting: Promise<HubPort> | null = null

  // Presence: sockets per game topic per user. Only the edges are reported; the refresh keeps the backend's lease
  // alive, and a hub reconnect re-reports everything under the same instance id.
  const presence = new Map<string, Map<number, number>>()
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  const { instance } = presenceOptions

  function report(method: 'Present' | 'Absent', topic: string, userId: number) {
    void port?.invoke(method, topic, userId, instance).catch(() => {})
  }

  function refreshAll() {
    for (const [topic, users] of presence) {
      for (const userId of users.keys()) report('Present', topic, userId)
    }
  }

  function present(topic: string, userId: number | undefined) {
    if (userId === undefined || !topic.startsWith(PRESENCE_KIND)) return
    let users = presence.get(topic)
    if (!users) presence.set(topic, (users = new Map()))
    const count = (users.get(userId) ?? 0) + 1
    users.set(userId, count)
    if (count === 1) report('Present', topic, userId)
  }

  function absent(topic: string, userId: number | undefined) {
    const users = userId === undefined ? undefined : presence.get(topic)
    if (userId === undefined || !users?.has(userId)) return
    const count = users.get(userId)! - 1
    if (count > 0) {
      users.set(userId, count)
      return
    }
    users.delete(userId)
    if (users.size === 0) presence.delete(topic)
    report('Absent', topic, userId)
  }

  function drop(topic: string, socket: LocalSocket): boolean {
    const sockets = topics.get(topic)
    if (!sockets?.delete(socket)) return false
    if (sockets.size === 0) topics.delete(topic)
    return true
  }

  function started(): Promise<HubPort> {
    if (starting) return starting
    const p = connect()
    p.onFrame((frame) =>
      pushFrame(frame, (bare) => {
        const listeners = topics.get(frame.topic) ?? new Set<LocalSocket>()
        for (const s of listeners) send(s, { kind: 'frame', frame: bare })
        return listeners.size
      }),
    )
    p.onReconnected(() => {
      bffMetrics.hubReconnected()
      // Group membership lives on the connection: rejoin every live topic and refresh its sockets.
      for (const topic of topics.keys()) {
        void p
          .invoke<LiveFrame | null>('Subscribe', topic)
          .then((frame) => {
            if (!frame) return
            for (const s of topics.get(topic) ?? []) send(s, { kind: 'frame', frame })
          })
          .catch(() => {})
      }
      refreshAll()
    })
    p.onClose(() => {
      for (const sockets of topics.values()) {
        for (const s of sockets) {
          send(s, { kind: 'error', message: 'live connection lost' })
          s.close(HUB_UNAVAILABLE, 'hub closed')
        }
      }
      topics.clear()
      // The sockets are gone; the backend's lease expires what they reported.
      presence.clear()
      if (refreshTimer !== null) presenceOptions.clearInterval(refreshTimer)
      refreshTimer = null
      port = null
      starting = null
    })
    starting = p.start().then(
      () => {
        port = p
        refreshTimer ??= presenceOptions.setInterval(refreshAll, presenceOptions.refreshMs)
        return p
      },
      (e: unknown) => {
        starting = null
        throw e
      },
    )
    return starting
  }

  return {
    async subscribe(topic, socket, userId) {
      let sockets = topics.get(topic)
      if (!sockets) topics.set(topic, (sockets = new Set()))
      sockets.add(socket)
      try {
        const hub = await started()
        const snapshot = await hub.invoke<LiveFrame | null>('Subscribe', topic)
        if (topics.get(topic)?.has(socket)) {
          if (snapshot) send(socket, { kind: 'frame', frame: snapshot })
          present(topic, userId)
        } else if (!topics.has(topic)) {
          // Everyone left while Subscribe was in flight, so the join landed after the last unsubscribe: undo it.
          await hub.invoke('Unsubscribe', topic).catch(() => {})
        }
      } catch (e) {
        if (!drop(topic, socket)) return
        send(socket, { kind: 'error', message: e instanceof Error ? e.message : 'hub error' })
        socket.close(HUB_UNAVAILABLE, 'hub unavailable')
      }
    },

    async unsubscribe(topic, socket, userId) {
      if (!drop(topic, socket)) return
      absent(topic, userId)
      if (topics.has(topic) || !port) return
      await port.invoke('Unsubscribe', topic).catch(() => {})
    },

    topicCount: () => topics.size,
  }
}

/**
 * The real `HubPort`: one SignalR connection to the backend's `/hub/live`, authenticated as the `chess_bff` service
 * account. In Node the client sends the token as an `Authorization: Bearer` header (browsers would use the query
 * string), which JwtBearer takes over any cookie.
 */
export function signalRPort(url: string, accessToken: () => Promise<string>): HubPort {
  const hub = new HubConnectionBuilder()
    .withUrl(url, { accessTokenFactory: accessToken, transport: HttpTransportType.WebSockets })
    .withAutomaticReconnect()
    .build()
  return {
    start: () => hub.start(),
    invoke: (method, ...args) => hub.invoke(method, ...args),
    onFrame: (handler) =>
      hub.on('frame', (frame: unknown) => {
        if (isLiveFrame(frame)) handler(frame)
      }),
    onReconnected: (handler) => hub.onreconnected(() => handler()),
    onClose: (handler) => hub.onclose(() => handler()),
    stop: () => hub.stop(),
  }
}

let shared: HubMultiplexer | null = null

/** The process-wide multiplexer. Config is read on first use, so a missing env var fails the first socket loudly. */
export function liveMultiplexer(): HubMultiplexer {
  if (!shared) {
    const client = relayClient()
    const token = createServiceToken({
      fetch: (...args) => fetch(...args),
      now: () => Date.now(),
      tokenUrl: keycloakTokenUrl(),
      clientId: client.id,
      clientSecret: client.secret,
    })
    const url = `${apiUrl()}/hub/live`
    shared = createHubMultiplexer(() => signalRPort(url, token))
  }
  return shared
}

/**
 * The relay's service token (`chess_bff`, client credentials), cached until 30 s before it expires. SignalR asks for
 * it on every (re)connect through `accessTokenFactory`; concurrent askers share one in-flight fetch, and a failed
 * fetch is not cached, so the next ask retries.
 */

export class ServiceTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServiceTokenError'
  }
}

export interface ServiceTokenDeps {
  fetch: typeof fetch
  now: () => number
  tokenUrl: string
  clientId: string
  clientSecret: string
}

const REFRESH_MARGIN_MS = 30_000

export function createServiceToken(deps: ServiceTokenDeps): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null
  let inFlight: Promise<string> | null = null

  async function fetchToken(): Promise<string> {
    const res = await deps.fetch(deps.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
      }).toString(),
    })
    if (!res.ok) {
      throw new ServiceTokenError(`token endpoint returned ${res.status}`)
    }
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      throw new ServiceTokenError('token endpoint returned no access_token/expires_in')
    }
    cached = { token: body.access_token, expiresAt: deps.now() + body.expires_in * 1000 }
    return body.access_token
  }

  return () => {
    if (cached && cached.expiresAt - deps.now() > REFRESH_MARGIN_MS) {
      return Promise.resolve(cached.token)
    }
    inFlight ??= fetchToken().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
