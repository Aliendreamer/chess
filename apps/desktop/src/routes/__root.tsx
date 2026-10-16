import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { RouterContext } from '#/lib/app'
import { Shell } from '#/components/layout'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
})

function Root() {
  const { app } = Route.useRouteContext()
  return (
    <Shell onExternalLink={(url) => void app.openLink(url)}>
      <Outlet />
    </Shell>
  )
}
