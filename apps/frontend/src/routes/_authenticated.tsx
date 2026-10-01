import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getMe, getPreferences } from '#/lib/server/api'
import { Shell } from '#/components/layout'

/**
 * Pathless layout: the SSR gate. Anonymous requests never render a child — they are 302'd to the login
 * proxy with the current location as returnTo. `me` and the user's display preferences (user-preferences) go into
 * router context for every child, so the server-rendered page already uses them.
 * This is UX; the API's [Authorize] remains the real boundary (server functions forward the cookie).
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const [me, prefs] = await Promise.all([getMe(), getPreferences()])
    if (!me) {
      throw redirect({ href: `/api/auth/login?returnTo=${encodeURIComponent(location.href)}` })
    }
    return { me, prefs }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { me, prefs } = Route.useRouteContext()
  return (
    <Shell me={me} prefs={prefs}>
      <Outlet />
    </Shell>
  )
}
