import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Shell } from './layout'
import type { ReactNode } from 'react'
import { DEFAULT_PREFERENCES } from '#/lib/auth'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
    for (const name of ['Home', 'Watch', 'History', 'Studies', 'Settings']) {
      expect(within(rail).getByRole('link', { name })).toBeDefined()
    }
    const icons = [...rail.querySelectorAll('svg')]
    expect(icons.length).toBe(5)
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
    for (const name of ['Home', 'Watch', 'History', 'Studies', 'Settings', 'Log out']) {
      expect(menu.getByRole('link', { name })).toBeDefined()
    }
    expect(screen.getByRole('complementary').className).toContain('hidden')
    // One identity for e2e to find: the rail's.
    expect(screen.getAllByTestId('identity-name')).toHaveLength(1)
  })
})
