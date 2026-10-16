import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { STANDARD_START } from '@chess/core'
import { fakeServices, renderApp } from '#/testing'
import { createStudies, listStudies } from '#/lib/data/studies'

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
async function app() {
  const s = await fakeServices()
  services.push(s)
  return s
}

describe('studies (desktop-app)', () => {
  it('imports pasted PGN and reports a game it could not read', async () => {
    const s = await app()
    await renderApp('/studies', s)
    fireEvent.change(await screen.findByLabelText('PGN'), {
      target: { value: '[Event "Good"]\n\n1. e4 e5 *\n\n[Event "Bad"]\n\n1. e4 e4 *' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    const report = await screen.findByTestId('import-report')
    expect(report.textContent).toContain('Imported 1 study.')
    expect(report.textContent).toContain('Game 2')
    await waitFor(async () => expect(await listStudies(s.db)).toHaveLength(1))
  })

  it('saves a move played on the board and exports the PGN', async () => {
    const s = await app()
    const { created } = await createStudies(s.db, [
      { title: 'Mine', startFen: STANDARD_START, tree: [] },
    ])
    const { container } = await renderApp(`/studies/${created[0]!.id}`, s)
    await screen.findByLabelText('Title')
    fireEvent.click(container.querySelector('[data-square="e2"]') as Element)
    fireEvent.click(container.querySelector('[data-square="e4"]') as Element)
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saved' })
    fireEvent.click(screen.getByRole('button', { name: 'Save PGN' }))
    await waitFor(() => expect(s.saved[0]?.text.trim().endsWith('1. e4 *')).toBe(true))
  })
})
