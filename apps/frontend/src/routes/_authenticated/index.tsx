import { createFileRoute } from '@tanstack/react-router'
import { getHealth } from '#/lib/server/api'
import { settle } from '#/lib/server/api-loaders'
import { Dashboard } from '#/components/Dashboard'

/** SSR-with-data: the loader runs server functions, the component only renders props. */
export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    const [health] = await Promise.all([settle(getHealth())])
    return { health }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { me } = Route.useRouteContext()
  const { health } = Route.useLoaderData()
  return <Dashboard me={me} health={health} />
}
