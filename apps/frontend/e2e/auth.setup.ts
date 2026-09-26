import { test as setup } from '@playwright/test'
import { PASS, PLAYER, PLAYER_PASS, USER, loginThroughKeycloak, sessionFile } from './support'

// Log each user in once per run and save the browser state (the mp_sid cookie); every spec reuses it. Repeated
// logins of one user within a second trip Keycloak's brute-force "quick login check" and lock the account.
for (const [user, pass] of [
  [USER, PASS],
  [PLAYER, PLAYER_PASS],
] as const) {
  setup(`sign in as ${user}`, async ({ browser }) => {
    const context = await browser.newContext()
    await loginThroughKeycloak(await context.newPage(), user, pass)
    await context.storageState({ path: sessionFile(user) })
    await context.close()
  })
}
