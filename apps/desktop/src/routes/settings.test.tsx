import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeServices, renderApp } from '#/testing'
import { getSetting } from '#/lib/data/settings'

const services: Array<{ close: () => void }> = []
afterEach(() => {
  cleanup()
  services.splice(0).forEach((s) => s.close())
})

describe('settings and about (desktop-app)', () => {
  it('applies the light theme at once and keeps it', async () => {
    const s = await fakeServices()
    services.push(s)
    await renderApp('/settings', s)
    const group = await screen.findByRole('group', { name: 'Site theme' })
    fireEvent.click(within(group).getByRole('button', { name: /Parchment|Light/ }))
    await waitFor(() => expect(screen.getByTestId('shell').dataset.theme).toBe('light'))
    expect(
      (await getSetting<{ siteTheme: string }>(s.db, 'preferences', { siteTheme: 'dark' }))
        .siteTheme,
    ).toBe('light')
    cleanup()
    await renderApp('/', s)
    await waitFor(() => expect(screen.getByTestId('shell').dataset.theme).toBe('light'))
  })

  it('names the version and the licences it ships with', async () => {
    const s = await fakeServices()
    services.push(s)
    await renderApp('/about', s)
    const credits = await screen.findByTestId('about-credits')
    expect(credits.textContent).toContain('Stockfish 19')
    expect(credits.textContent).toContain('GNU General Public License v3')
    expect(credits.textContent).toContain('Cburnett')
    expect(screen.getByTestId('about-app').textContent).toContain('MIT')
  })
})
