import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fakeServices, renderApp } from '#/testing'
import { importLibrary, searchLibrary } from '#/lib/data/library'

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList
})
const services: Array<{ close: () => void }> = []
afterEach(() => {
  cleanup()
  services.splice(0).forEach((s) => s.close())
})

const FILE =
  '[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n[Date "1985.10.15"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 1-0\n\n' +
  '[White "Fischer, Robert"]\n[Black "Spassky, Boris"]\n[Date "1972.07.23"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2'

describe('the library (desktop-app)', () => {
  it('imports an opened file and lists its games', async () => {
    const s = await fakeServices()
    services.push(s)
    s.openText = () => Promise.resolve(FILE)
    await renderApp('/library', s)
    fireEvent.click(await screen.findByRole('button', { name: 'Import a PGN file' }))
    expect((await screen.findByTestId('library-report')).textContent).toContain('Imported 2')
    await waitFor(() =>
      expect(screen.getByTestId('library-games').textContent).toContain('Kasparov'),
    )
  })

  it('shows the games at the position on the analysis board', async () => {
    const s = await fakeServices()
    services.push(s)
    await importLibrary(s.db, FILE, null)
    const [game] = await searchLibrary(s.db, { player: 'Kasparov' })
    await renderApp(`/analysis?library=${game!.id}&ply=1`, s)
    const panel = await screen.findByTestId('library-panel')
    expect(panel.textContent).toContain('2 games')
    expect(screen.getByTestId('analysis-source').textContent).toBe(
      'Kasparov, Garry vs Karpov, Anatoly',
    )
  })
})
