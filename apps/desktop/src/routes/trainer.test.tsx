import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fakeServices, renderApp } from '#/testing'
import { ensureOpenings } from '#/lib/data/openings'

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
const LIST =
  'eco\tname\tpgn\nC65\tRuy Lopez: Berlin Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6\nA80\tDutch Defense\t1. d4 f5'

describe('the opening trainer (desktop-app)', () => {
  it('shows the families in their columns and drills one', async () => {
    const s = await fakeServices()
    services.push(s)
    await ensureOpenings(s.db, () => Promise.resolve([LIST]))
    await renderApp('/trainer', s)
    expect(
      (await screen.findByRole('link', { name: /Dutch Defense/ })).getAttribute('href'),
    ).toContain('/trainer/Dutch%20Defense')
    cleanup()
    await renderApp('/trainer/Ruy%20Lopez?color=white', s)
    expect(await screen.findByText('C65 Ruy Lopez: Berlin Defense')).toBeTruthy()
  })
})
