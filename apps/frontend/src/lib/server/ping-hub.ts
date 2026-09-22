import { HttpTransportType, HubConnectionBuilder } from '@microsoft/signalr'
import { apiUrl } from './config'
import { mapHubMessage } from './ping-relay'
import type { HubConnection } from '@microsoft/signalr'

/**
 * The relay's I/O half, shared by both servers that host it: the Nitro route in the built output and
 * the Vite dev plugin. Only the socket differs, so it arrives as this tiny interface.
 */
export interface RelaySocket {
  send: (data: string) => void
  close: (code: number, reason: string) => void
}

/** 4401: application-level "unauthenticated" (1000–1015 are reserved by the protocol). */
export const UNAUTHENTICATED = 4401
export const INTERNAL = 1011

/**
 * Opens the backend hub connection for one browser socket and pumps `state` invocations into it.
 * Returns the connection so the caller can stop it when its socket closes, or null when the hub
 * could not be reached — in which case the browser has already been told and the socket closed.
 */
export async function connectPingHub(
  id: string,
  cookie: string,
  socket: RelaySocket,
): Promise<HubConnection | null> {
  const hub = new HubConnectionBuilder()
    .withUrl(`${apiUrl()}/hub/pings`, {
      headers: { cookie },
      transport: HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect()
    .build()

  hub.on('state', (...args: Array<unknown>) => {
    const frame = mapHubMessage('state', args)
    if (frame) socket.send(JSON.stringify(frame))
  })
  hub.onclose(() => socket.close(INTERNAL, 'hub closed'))
  // Re-subscribe after a reconnect: group membership lives on the connection, not the session.
  hub.onreconnected(() => void hub.invoke('Subscribe', id))

  try {
    await hub.start()
    await hub.invoke('Subscribe', id)
    return hub
  } catch (e) {
    const message = e instanceof Error ? e.message : 'hub error'
    socket.send(JSON.stringify({ kind: 'error', message }))
    socket.close(INTERNAL, 'hub unavailable')
    return null
  }
}
