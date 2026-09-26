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
  projects: [
    // Signs each user in once and saves the session; the specs start already signed in as testuser.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { browserName: 'chromium' } },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { browserName: 'chromium', storageState: 'e2e/.auth/testuser.json' },
    },
  ],
})
