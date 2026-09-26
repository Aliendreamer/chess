import { defineConfig } from '@playwright/test'

/** Runs against the live local stack (tools/e2e.sh brings it up). The browser only ever opens app. and keycloak. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  // One worker: every spec logs in through the real Keycloak as the same users, and Keycloak's brute-force
  // protection treats two logins of one user within a second as an attack ("quick login check") and locks the
  // account for a minute. Parallel workers trip it; the realm's protection stays on.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://app.chess.localhost',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
