import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getMe } from '#/lib/server/api'
import { Shell } from '#/components/Shell'

/**
 * Pathless layout: the SSR gate. Anonymous requests never render a child — they are 302'd to the login
 * proxy with the current location as returnTo. `me` goes into router context for every child.
 * This is UX; the API's [Authorize] remains the real boundary (server functions forward the cookie).
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const me = await getMe()
    if (!me) {
      throw redirect({ href: `/api/auth/login?returnTo=${encodeURIComponent(location.href)}` })
    }
    return { me }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { me } = Route.useRouteContext()
  return (
    <Shell me={me}>
      <Outlet />
    </Shell>
  )
}
