// ws is pinned at 7.x because @microsoft/signalr requires it, and 7.x is CommonJS: a named import
// (`{ Server }`) resolves in TypeScript but throws under Node's ESM loader, so take the default.
import WebSocket from 'ws'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { BAD_TOPIC, LIVE_PREFIX, openRelay, parseLiveUrl, relayDeps } from './live-relay'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { Plugin } from 'vite'

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
            ws.close(BAD_TOPIC, 'unknown live topic')
            return
          }
          const cookie = forwardCookieHeader(request.headers.cookie, cookiesAreSecure())
          const relay = openRelay(
            target,
            cookie,
            { send: (data) => ws.send(data), close: (code, reason) => ws.close(code, reason) },
            relayDeps(),
          )
          ws.on('close', () => void relay.close())
          ws.on('error', () => void relay.close())
        })
      })
    },
  }
}
