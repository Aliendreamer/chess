import { URL, fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * The desktop app's UI (desktop-app D2): a client-only Vite SPA that Tauri loads from `dist/` (and from :1420 in
 * development). No SSR, no server functions; data comes from SQLite and the bundled engine through `lib/data`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    viteReact(),
  ],
  // Tauri expects a fixed port and its own error output in the terminal.
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    // Page tests render the whole app; under a parallel run of every project they need more than 5 s.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/routeTree.gen.ts', 'src/main.tsx', 'src/routes/**', '**/*.test.{ts,tsx}'],
      thresholds: { lines: 75, statements: 75, functions: 75, branches: 70 },
      reporter: ['text-summary'],
    },
  },
})
