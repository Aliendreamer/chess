import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { DEFAULT_PREFERENCES } from '@chess/core'
import { AppLink } from '@chess/ui'
import { NotFound, Shell } from './layout'
import type { ReactNode } from 'react'
import type { Preferences } from '@chess/core'

afterEach(cleanup)

function renderAt(path: string, page: () => ReactNode, prefs?: Preferences) {
  const root = createRootRoute()
  const routes = ['/', '/trainer/$family', '/analysis'].map((p) =>
    createRoute({
      getParentRoute: () => root,
      path: p,
      component: () => <Shell {...(prefs ? { prefs } : {})}>{page()}</Shell>,
    }),
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('Shell', () => {
  it('shows the one-player rail with no club items', async () => {
    renderAt('/', () => <p>page</p>)
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const labels = [...nav.querySelectorAll('a')].map((a) => a.textContent)
    expect(labels).toEqual([
      'Play',
      'Analysis',
      'Studies',
      'Trainer',
      'Training',
      'Library',
      'News',
      'Settings',
    ])
    expect(screen.queryByText(/members|admin|sign out/i)).toBeNull()
  })

  it('carries the board and site themes on its root', async () => {
    renderAt('/', () => <p>page</p>, {
      ...DEFAULT_PREFERENCES,
      boardTheme: 'green',
      siteTheme: 'light',
    })
    const shell = await screen.findByTestId('shell')
    expect([shell.dataset.board, shell.dataset.theme]).toEqual(['green', 'light'])
  })

  it('makes shared links router links, the query read as the router reads one', async () => {
    renderAt('/', () => <AppLink to="/analysis?library=abc&ply=12">Open</AppLink>)
    const link = await screen.findByRole('link', { name: 'Open' })
    expect(link.getAttribute('href')).toBe('/analysis?library=abc&ply=12')
  })
})

describe('NotFound', () => {
  it('leads back to play', async () => {
    renderAt('/', () => <NotFound />)
    expect((await screen.findByRole('link', { name: 'Back to play' })).getAttribute('href')).toBe(
      '/',
    )
  })
})
