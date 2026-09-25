import type { LiveFrame, SocketMessage } from '../live'

/**
 * One backend hub connection per SSR process, shared by every browser socket (ROADMAP D5). Topics are
 * reference-counted: the first local subscriber joins the backend group, the last one leaves it. Every subscriber
 * gets its own snapshot from `Subscribe`; pushes fan out by `frame.topic`. Transport-injected (`HubPort`) so all of
 * it is unit-tested without SignalR; `live-hub.ts` provides the real port.
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
  subscribe: (topic: string, socket: LocalSocket) => Promise<void>
  unsubscribe: (topic: string, socket: LocalSocket) => Promise<void>
  topicCount: () => number
}

/** 1011: the hub is unavailable (protocol "internal error"). */
export const HUB_UNAVAILABLE = 1011

const send = (socket: LocalSocket, message: SocketMessage) => socket.send(JSON.stringify(message))

export function createHubMultiplexer(connect: () => HubPort): HubMultiplexer {
  const topics = new Map<string, Set<LocalSocket>>()
  let port: HubPort | null = null
  let starting: Promise<HubPort> | null = null

  function drop(topic: string, socket: LocalSocket): boolean {
    const sockets = topics.get(topic)
    if (!sockets?.delete(socket)) return false
    if (sockets.size === 0) topics.delete(topic)
    return true
  }

  function started(): Promise<HubPort> {
    if (starting) return starting
    const p = connect()
    p.onFrame((frame) => {
      for (const s of topics.get(frame.topic) ?? []) send(s, { kind: 'frame', frame })
    })
    p.onReconnected(() => {
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
    })
    p.onClose(() => {
      for (const sockets of topics.values()) {
        for (const s of sockets) {
          send(s, { kind: 'error', message: 'live connection lost' })
          s.close(HUB_UNAVAILABLE, 'hub closed')
        }
      }
      topics.clear()
      port = null
      starting = null
    })
    starting = p.start().then(
      () => {
        port = p
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
    async subscribe(topic, socket) {
      let sockets = topics.get(topic)
      if (!sockets) topics.set(topic, (sockets = new Set()))
      sockets.add(socket)
      try {
        const hub = await started()
        const snapshot = await hub.invoke<LiveFrame | null>('Subscribe', topic)
        if (topics.get(topic)?.has(socket)) {
          if (snapshot) send(socket, { kind: 'frame', frame: snapshot })
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

    async unsubscribe(topic, socket) {
      if (!drop(topic, socket) || topics.has(topic) || !port) return
      await port.invoke('Unsubscribe', topic).catch(() => {})
    },

    topicCount: () => topics.size,
  }
}
