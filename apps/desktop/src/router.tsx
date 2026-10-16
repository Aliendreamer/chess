import { createHashHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { NotFound } from './components/layout'
import type { AppServices } from './lib/app'

/**
 * The app's router (desktop-app D2): hash history, so a reload inside the webview never asks the asset server for a
 * path it does not have; the services are its context, so loaders read the database the app opened.
 */
export function getRouter(app: AppServices) {
  return createRouter({
    routeTree,
    context: { app },
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
