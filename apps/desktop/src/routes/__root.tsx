import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { RouterContext } from '#/lib/app'
import { Shell } from '#/components/layout'
import { getPreferences } from '#/lib/data/settings'

export const Route = createRootRouteWithContext<RouterContext>()({
  // The player's display settings, for the Shell (board and site theme) and every board (animation, coordinates,
  // the engine switches).
  loader: ({ context: { app } }) => getPreferences(app.db),
  component: Root,
})

function Root() {
  const { app } = Route.useRouteContext()
  const prefs = Route.useLoaderData()
  return (
    <Shell prefs={prefs} onExternalLink={(url) => void app.openLink(url)}>
      <Outlet />
    </Shell>
  )
}
