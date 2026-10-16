import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { DEFAULT_PREFERENCES } from '@chess/core'
import type { Preferences } from '@chess/core'
import type { RouterContext } from '#/lib/app'
import { Shell } from '#/components/layout'
import { getSetting } from '#/lib/data/settings'

export const Route = createRootRouteWithContext<RouterContext>()({
  // The player's display settings, for the Shell (board and site theme) and every board (animation, coordinates).
  loader: ({ context: { app } }) =>
    getSetting<Preferences>(app.db, 'preferences', DEFAULT_PREFERENCES),
  component: Root,
})

function Root() {
  const { app } = Route.useRouteContext()
  const prefs = Route.useLoaderData()
  return (
    <Shell
      prefs={{ ...DEFAULT_PREFERENCES, ...prefs }}
      onExternalLink={(url) => void app.openLink(url)}
    >
      <Outlet />
    </Shell>
  )
}
