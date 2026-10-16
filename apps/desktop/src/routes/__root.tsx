import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Shell } from '#/components/layout'

export const Route = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
})
