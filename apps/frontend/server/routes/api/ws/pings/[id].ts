import { defineWebSocketHandler } from 'h3'
import { cookiesAreSecure, forwardCookieHeader } from '../../../../../src/lib/server/cookies'
import { UNAUTHENTICATED, connectPingHub } from '../../../../../src/lib/server/ping-hub'
import { pingIdFromUrl } from '../../../../../src/lib/server/ping-relay'
import type { HubConnection } from '@microsoft/signalr'

/**
 * The SSR WebSocket relay in the BUILT server: browser ↔ `app.` (this) ↔ SignalR ↔ backend `/hub/pings`.
 *
 * Scanned by Nitro (`scanDirs: ['server']`), which only exists after `vite build` — `vite dev` serves the
 * same path through `src/lib/server/dev-ping-relay.ts` instead. Both share `connectPingHub`, so there is
 * one relay implementation and two ways to host it.
 */

const HUB_CONNECTION = 'pingHub'

export default defineWebSocketHandler({
  async open(peer) {
    const id = pingIdFromUrl(peer.request.url)
    const cookie = forwardCookieHeader(peer.request.headers.get('cookie'), cookiesAreSecure())
    if (!id || !cookie) {
      peer.close(UNAUTHENTICATED, 'unauthenticated')
      return
    }

    peer.context[HUB_CONNECTION] = await connectPingHub(id, cookie, {
      send: (data) => peer.send(data),
      close: (code, reason) => peer.close(code, reason),
    })
  },

  async close(peer) {
    await (peer.context[HUB_CONNECTION] as HubConnection | undefined)?.stop()
  },

  async error(peer) {
    await (peer.context[HUB_CONNECTION] as HubConnection | undefined)?.stop()
  },
})
