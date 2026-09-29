import { useEffect } from 'react'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '#/styles.css?url'
import type { ReactNode } from 'react'
import type { Me } from '#/lib/auth'
import { getTelemetry } from '#/lib/server/api'

export interface RouterContext {
  me: Me | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Chess' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  // Asked once per page load: whether telemetry is on does not change while the page is open.
  loader: () => getTelemetry(),
  staleTime: Infinity,
  shellComponent: RootDocument,
  component: Root,
})

function Root() {
  const { enabled } = Route.useLoaderData()
  useEffect(() => {
    if (enabled) void import('#/lib/telemetry-web').then((m) => m.startBrowserTracing())
  }, [enabled])
  return <Outlet />
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
