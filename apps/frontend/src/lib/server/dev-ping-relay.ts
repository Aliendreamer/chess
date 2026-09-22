// ws is pinned at 7.x because @microsoft/signalr requires it, and 7.x is CommonJS: a named import
// (`{ Server }`) resolves in TypeScript but throws under Node's ESM loader, so take the default.
import WebSocket from 'ws'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { UNAUTHENTICATED, connectPingHub } from './ping-hub'
import { pingIdFromUrl } from './ping-relay'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { Plugin } from 'vite'

/** Everything under here is the relay; anything else on the dev server stays Vite's (HMR included). */
const RELAY_PREFIX = '/api/ws/pings/'

/**
 * The relay for `vite dev`. The Nitro plugin only runs on `build`, so the scanned handler in
 * `server/routes/api/ws/pings/[id].ts` does not exist in dev — without this, a developer (and the
 * Playwright ping spec, which runs against the dev container) gets a page that never leaves
 * "connecting…". Both paths share `connectPingHub`; only the socket plumbing differs.
 */
export function devPingRelay(): Plugin {
  return {
    name: 'chess:dev-ping-relay',
    apply: 'serve',
    configureServer(server) {
      const sockets = new WebSocket.Server({ noServer: true })

      server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const url = request.url ?? ''
        // Not ours: leave the socket untouched so Vite's HMR upgrade still gets it.
        if (!url.startsWith(RELAY_PREFIX)) return

        const id = pingIdFromUrl(url)
        const cookie = forwardCookieHeader(request.headers.cookie, cookiesAreSecure())

        sockets.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          if (!id || !cookie) {
            ws.close(UNAUTHENTICATED, 'unauthenticated')
            return
          }

          void connectPingHub(id, cookie, {
            send: (data) => ws.send(data),
            close: (code, reason) => ws.close(code, reason),
          }).then((hub) => {
            if (!hub) return
            ws.on('close', () => void hub.stop())
            ws.on('error', () => void hub.stop())
          })
        })
      })
    },
  }
}
