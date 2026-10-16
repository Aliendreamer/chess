import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { STANDARD_START, positionKey } from '@chess/core'
import { fakeServices, renderApp } from '#/testing'
import { storeEvaluation } from '#/lib/data/analysis'
import { ensureOpenings } from '#/lib/data/openings'
import { createGame, personMove } from '#/lib/data/play'

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

describe('the analysis board (desktop-app)', () => {
  it('shows a stored evaluation of the position at once, and names the opening', async () => {
    const s = await app()
    await ensureOpenings(s.db, () => Promise.resolve(["eco\tname\tpgn\nB00\tKing's Pawn\t1. e4"]))
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    await storeEvaluation(s.db, positionKey(afterE4), {
      thinkMs: 10_000,
      depth: 30,
      lines: [{ cp: 31, mate: null, pv: ['e7e5'] }],
    })
    await renderApp(`/analysis?fen=${encodeURIComponent(STANDARD_START)}`, s)
    fireEvent.change(await screen.findByLabelText('FEN or PGN'), { target: { value: '1. e4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect((await screen.findByTestId('opening-name')).textContent).toBe("B00 King's Pawn")
    await waitFor(() => expect(document.body.textContent).toContain('+0.31'))
  })

  it('refuses a game still in play', async () => {
    const s = await app()
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await personMove(s.db, game.id, 'e2e4')
    await renderApp(`/analysis?game=${game.id}`, s)
    expect((await screen.findByTestId('paste-error')).textContent).toContain('once it has ended')
  })
})
