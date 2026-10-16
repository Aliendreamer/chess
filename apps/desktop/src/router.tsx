import { createHashHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { NotFound } from './components/layout'

/**
 * The app's router (desktop-app D2): hash history, so a reload inside the webview never asks the asset server for a
 * path it does not have.
 */
export function getRouter() {
  return createRouter({
    routeTree,
    history: createHashHistory(),
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
