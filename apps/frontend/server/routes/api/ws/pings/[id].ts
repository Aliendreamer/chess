import { HttpTransportType, HubConnectionBuilder } from '@microsoft/signalr'
import { defineWebSocketHandler } from 'h3'
import { apiUrl } from '../../../../../src/lib/server/config'
import { cookiesAreSecure, forwardCookieHeader } from '../../../../../src/lib/server/cookies'
import { mapHubMessage, pingIdFromUrl } from '../../../../../src/lib/server/ping-relay'
import type { HubConnection } from '@microsoft/signalr'

/**
 * The SSR WebSocket relay: browser ↔ `app.` (this) ↔ SignalR client ↔ backend `/hub/pings`.
 *
 * Scanned by Nitro (`scanDirs: ['server']` in vite.config.ts), so it exists only in the built
 * node-server — `vite dev` has no Nitro and therefore no relay. The session cookie is forwarded
 * exactly as the server functions do, which is what keeps the API host out of the browser.
 */

const HUB_CONNECTION = 'pingHub'

/** 4401: application-level "unauthenticated" (1000–1015 are reserved by the protocol). */
const UNAUTHENTICATED = 4401
const INTERNAL = 1011

function hubOf(context: Record<string, unknown>): HubConnection | undefined {
  return context[HUB_CONNECTION] as HubConnection | undefined
}

export default defineWebSocketHandler({
  async open(peer) {
    const id = pingIdFromUrl(peer.request.url)
    const cookie = forwardCookieHeader(peer.request.headers.get('cookie'), cookiesAreSecure())
    if (!id || !cookie) {
      peer.close(UNAUTHENTICATED, 'unauthenticated')
      return
    }

    const hub = new HubConnectionBuilder()
      .withUrl(`${apiUrl()}/hub/pings`, {
        headers: { cookie },
        transport: HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build()

    hub.on('state', (...args: Array<unknown>) => {
      const frame = mapHubMessage('state', args)
      if (frame) peer.send(JSON.stringify(frame))
    })
    hub.onclose(() => peer.close(INTERNAL, 'hub closed'))
    // Re-subscribe after a reconnect: group membership lives on the connection, not the session.
    hub.onreconnected(() => void hub.invoke('Subscribe', id))

    peer.context[HUB_CONNECTION] = hub
    try {
      await hub.start()
      await hub.invoke('Subscribe', id)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'hub error'
      peer.send(JSON.stringify({ kind: 'error', message }))
      peer.close(INTERNAL, 'hub unavailable')
    }
  },

  async close(peer) {
    await hubOf(peer.context)?.stop()
  },

  async error(peer) {
    await hubOf(peer.context)?.stop()
  },
})
