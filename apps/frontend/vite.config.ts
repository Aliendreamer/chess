import { createRequire } from 'node:module'
import { URL, fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { devPingRelay } from './src/lib/server/dev-ping-relay'

/**
 * @microsoft/signalr reaches its Node transports through an indirect `requireFunc(...)` that neither
 * rollup nor node-file-trace can see, so they never land in `.output/server/node_modules` — and the
 * runtime image copies only `.output`. Tracing them explicitly is what keeps the relay alive there.
 * Node >= 18 has global `fetch`/`AbortController`, so node-fetch and abort-controller are never reached.
 *
 * Resolved only when building: `traceInclude` wants file paths rather than bare specifiers, and
 * resolving at config load would make `vite dev` — which has no Nitro and no relay — fail outright
 * wherever these packages are absent, as the dev container's node_modules volume showed.
 */
function signalrNodeDeps(): Array<string> {
  const require = createRequire(import.meta.url)
  return ['ws', 'eventsource', 'fetch-cookie', 'tough-cookie'].map((id) => require.resolve(id))
}

export default defineConfig(({ command }) => ({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '#': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    // `scanDirs` (not `srcDir`, which would also move the ~/@ aliases and the publicAssets base)
    // makes Nitro pick up `server/routes/**` alongside the TanStack renderer; `experimental.websocket`
    // attaches crossws to the node-server's upgrade event so the ping relay can accept upgrades.
    nitroV2Plugin({
      preset: 'node-server',
      scanDirs: ['server'],
      experimental: { websocket: true },
      externals: { traceInclude: command === 'build' ? signalrNodeDeps() : [] },
    }),
    viteReact(),
    // `vite dev` has no Nitro, so the scanned relay route does not exist there; this serves the same
    // path off the dev server's upgrade event.
    devPingRelay(),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
}))
