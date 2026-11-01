import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { STANDARD_START } from '@chess/core'
import { DRAFTS, createStudies, getSetting, listStudies } from '@chess/local'
import { fakeServices, renderApp } from '#/testing'

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

  it('keeps an unsaved edit after the app closed, and drops it once saved', async () => {
    const s = await app()
    const { created } = await createStudies(s.db, [
      { title: 'Mine', startFen: STANDARD_START, tree: [] },
    ])
    const id = created[0]!.id
    const first = await renderApp(`/studies/${id}`, s)
    await screen.findByLabelText('Title')
    fireEvent.click(first.container.querySelector('[data-square="e2"]') as Element)
    fireEvent.click(first.container.querySelector('[data-square="e4"]') as Element)
    await waitFor(
      async () => expect(await getSetting(s.db, DRAFTS.study(id), null)).not.toBeNull(),
      {
        timeout: 2000,
      },
    )
    cleanup()
    await renderApp(`/studies/${id}`, s)
    await waitFor(() => expect(screen.getByTestId('move-tree').textContent).toContain('e4'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saved' })
    expect(await getSetting(s.db, DRAFTS.study(id), null)).toBeNull()
  })

  it('stays on a move made the main line, so Delete move deletes that one', async () => {
    const s = await app()
    const { created } = await createStudies(s.db, [
      { title: 'Mine', startFen: STANDARD_START, tree: [] },
    ])
    const { container } = await renderApp(`/studies/${created[0]!.id}`, s)
    await screen.findByLabelText('Title')
    const click = (name: string) =>
      fireEvent.click(container.querySelector(`[data-square="${name}"]`) as Element)
    click('e2')
    click('e4')
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    click('d2')
    click('d4')
    fireEvent.click(screen.getByRole('button', { name: 'Make main line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete move' }))
    const tree = screen.getByTestId('move-tree').textContent
    expect(tree).toContain('e4')
    expect(tree).not.toContain('d4')
  })
})
