import { defineConfig } from '@playwright/test'

/** Runs against the live local stack (tools/e2e.sh brings it up). The browser only ever opens app. and keycloak. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://app.chess.localhost',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
