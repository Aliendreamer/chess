import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { NotFound, PendingBar, RouterError } from './components/layout'

export function getRouter() {
  return createRouter({
    routeTree,
    context: { me: null },
    defaultPreload: 'intent',
    scrollRestoration: true,
    // ui-polish: a slow navigation shows a bar, a failed load a Club panel, an unknown address the not-found page.
    defaultPendingMs: 300,
    defaultPendingComponent: PendingBar,
    defaultErrorComponent: RouterError,
    defaultNotFoundComponent: NotFound,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
