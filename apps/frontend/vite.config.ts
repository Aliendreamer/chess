import { createRequire } from 'node:module'
import { URL, fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// @microsoft/signalr reaches its Node transports through an indirect `requireFunc(...)` that neither
// rollup nor node-file-trace can see, so they never land in `.output/server/node_modules` — and the
// runtime image copies only `.output`. Tracing them explicitly is what keeps the relay alive in the
// container. Node >= 18 has global `fetch`/`AbortController`, so node-fetch and abort-controller are
// never reached. `traceInclude` wants resolved file paths, not bare specifiers.
const require = createRequire(import.meta.url)
const signalrNodeDeps = ['ws', 'eventsource', 'fetch-cookie', 'tough-cookie'].map((id) =>
  require.resolve(id),
)

export default defineConfig({
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
      externals: { traceInclude: signalrNodeDeps },
    }),
    viteReact(),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
