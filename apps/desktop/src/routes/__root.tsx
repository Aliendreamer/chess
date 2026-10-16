import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { RouterContext } from '#/lib/app'
import { Shell } from '#/components/layout'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
})
