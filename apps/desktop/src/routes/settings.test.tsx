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

describe('backup and restore on the settings page (desktop-app D10)', () => {
  it('backs up to the chosen file and restores it after a confirmation', async () => {
    const { mkdtempSync, existsSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { createStudies, listStudies } = await import('#/lib/data/studies')
    const s = await fakeServices()
    services.push(s)
    const path = join(mkdtempSync(join(tmpdir(), 'chess-ui-backup-')), 'mine.chessbackup')
    s.backups.chooseSave = () => Promise.resolve(path)
    s.backups.chooseOpen = () => Promise.resolve(path)
    await createStudies(s.db, [{ title: 'Before', tree: [] }])
    await renderApp('/settings', s)
    fireEvent.click(await screen.findByRole('button', { name: 'Back up…' }))
    await screen.findByText(`Backed up to ${path}.`)
    expect(existsSync(path)).toBe(true)
    await createStudies(s.db, [{ title: 'After', tree: [] }])
    fireEvent.click(screen.getByRole('button', { name: 'Restore…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace my data' }))
    await screen.findByText(/Restored\./)
    expect((await listStudies(s.db)).map((x) => x.title)).toEqual(['Before'])
  })
})
