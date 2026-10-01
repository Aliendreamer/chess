import { cleanup, render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
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
    const { container } = render(
      <Shell me={me}>
        <p>page</p>
      </Shell>,
    )
    for (const name of ['Home', 'History', 'Studies', 'Settings']) {
      expect(screen.getByRole('link', { name })).toBeDefined()
    }
    const icons = [...container.querySelectorAll('svg')]
    expect(icons.length).toBe(4)
    expect(icons.every((svg) => svg.closest('[aria-hidden]') !== null)).toBe(true)
  })
})
