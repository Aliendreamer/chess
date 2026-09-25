import { defineWebSocketHandler } from 'h3'
import { cookiesAreSecure, forwardCookieHeader } from '../../../../../../src/lib/server/cookies'
import {
  BAD_TOPIC,
  openRelay,
  parseLiveUrl,
  relayDeps,
} from '../../../../../../src/lib/server/live-relay'
import type { RelayHandle } from '../../../../../../src/lib/server/live-relay'

/**
 * The live relay in the BUILT server: browser ↔ `app.` (this) ↔ one shared hub connection ↔ backend `/hub/live`.
 *
 * Scanned by Nitro (`scanDirs: ['server']`), which only exists after `vite build` — `vite dev` serves the same path
 * through `src/lib/server/dev-live-relay.ts`. Both only adapt the socket; `openRelay` decides everything else.
 */

const RELAY = 'liveRelay'

export default defineWebSocketHandler({
  open(peer) {
    const target = parseLiveUrl(peer.request.url)
    if (!target) {
      peer.close(BAD_TOPIC, 'unknown live topic')
      return
    }
    const cookie = forwardCookieHeader(peer.request.headers.get('cookie'), cookiesAreSecure())
    peer.context[RELAY] = openRelay(
      target,
      cookie,
      { send: (data) => peer.send(data), close: (code, reason) => peer.close(code, reason) },
      relayDeps(),
    )
  },

  async close(peer) {
    await (peer.context[RELAY] as RelayHandle | undefined)?.close()
  },

  async error(peer) {
    await (peer.context[RELAY] as RelayHandle | undefined)?.close()
  },
})
