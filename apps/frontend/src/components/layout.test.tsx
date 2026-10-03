import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotFound, PendingBar, RouteError, Shell } from './layout'
import type { ReactNode } from 'react'
import { DEFAULT_PREFERENCES } from '#/lib/auth'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    activeOptions,
  }: {
    children: ReactNode
    to: string
    activeOptions?: { exact?: boolean }
  }) => (
    <a href={to} data-exact={String(activeOptions?.exact ?? false)}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

afterEach(cleanup)

const me = { id: 1, subject: 's', roles: [], username: 'ann' }

describe('Shell', () => {
  it("applies the user's board and site theme on its root, and links to Settings", () => {
    render(
      <Shell me={me} prefs={{ ...DEFAULT_PREFERENCES, boardTheme: 'green' }}>
        <p>page</p>
      </Shell>,
    )
    const shell = screen.getByTestId('shell')
    expect(shell.getAttribute('data-board')).toBe('green')
    expect(shell.getAttribute('data-theme')).toBe('dark')
    const rail = within(screen.getByRole('complementary'))
    expect(rail.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
  })

  it('uses the defaults without preferences', () => {
    render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    expect(screen.getByTestId('shell').getAttribute('data-board')).toBe('brown')
  })

  it('every rail icon is decorative and every link keeps its name (site-themes)', () => {
    render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    const rail = screen.getByRole('complementary')
    for (const name of [
      'Home',
      'Watch',
      'History',
      'Studies',
      'Analysis',
      'Library',
      'Trainer',
      'Profile',
      'Settings',
    ]) {
      expect(within(rail).getByRole('link', { name })).toBeDefined()
    }
    const icons = [...rail.querySelectorAll('svg')]
    expect(icons.length).toBe(10)
    expect(icons.every((svg) => svg.closest('[aria-hidden]') !== null)).toBe(true)
  })

  it('narrow screens get a top bar whose menu holds the same links and the logout (responsive-layout)', () => {
    render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    const bar = screen.getByRole('banner')
    expect(bar.className).toContain('shell:hidden')
    expect(bar.querySelector('details summary')?.textContent).toBe('Menu')
    const menu = within(bar)
    for (const name of [
      'Home',
      'Watch',
      'History',
      'Studies',
      'Analysis',
      'Profile',
      'Settings',
      'Log out',
    ]) {
      expect(menu.getByRole('link', { name })).toBeDefined()
    }
    expect(screen.getByRole('complementary').className).toContain('hidden')
    // One identity for e2e to find: the rail's.
    expect(screen.getAllByTestId('identity-name')).toHaveLength(1)
  })

  it('shows Admin only to admins (admin-screens)', () => {
    const { rerender } = render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    const rail = () => screen.getByRole('complementary')
    expect(within(rail()).queryByRole('link', { name: 'Admin' })).toBeNull()
    rerender(
      <Shell me={{ ...me, roles: ['User', 'Admin'] }}>
        <p>page</p>
      </Shell>,
    )
    expect(within(rail()).getByRole('link', { name: 'Admin' })).toBeDefined()
  })
})

describe('router screens (ui-polish)', () => {
  it('RouteError says what failed and offers another try and the way home', () => {
    const onRetry = vi.fn()
    render(<RouteError message="GET /api/games failed with 503" onRetry={onRetry} />)
    expect(screen.getByRole('heading', { name: 'This page could not be loaded' })).toBeDefined()
    expect(screen.getByText('GET /api/games failed with 503')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Home' })).toBeDefined()
  })

  it('NotFound leads home', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Home' })).toBeDefined()
  })

  it('PendingBar is a labelled progress bar', () => {
    render(<PendingBar />)
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeDefined()
  })
})

describe('shell details (ui-polish)', () => {
  it('Home and History match only themselves; other sections light up on their sub-pages', () => {
    render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    const rail = screen.getByRole('complementary')
    const exact = (name: string) =>
      within(rail).getByRole('link', { name }).getAttribute('data-exact')
    expect([exact('Home'), exact('History')]).toEqual(['true', 'true'])
    expect([exact('Studies'), exact('Watch'), exact('Settings')]).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  it('Escape closes the phone menu', () => {
    const { container } = render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    const menu = container.querySelector('details')!
    menu.setAttribute('open', '')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(menu.hasAttribute('open')).toBe(false)
  })

  it('the avatar uses site colours, not the board theme', () => {
    render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    const avatar = within(screen.getByRole('complementary')).getByText('A')
    expect(avatar.className).not.toContain('bg-board')
  })
})
