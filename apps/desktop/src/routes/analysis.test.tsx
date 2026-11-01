import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { STANDARD_START, fromInput, positionKey } from '@chess/core'
import {
  DRAFTS,
  createGame,
  draftWriter,
  ensureOpenings,
  loadBoardDraft,
  personMove,
  storeEvaluation,
} from '@chess/local'
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

  it('ticks the evaluation bar and the best moves, and remembers unticking them', async () => {
    const s = await app()
    await storeEvaluation(s.db, positionKey(STANDARD_START), {
      thinkMs: 10_000,
      depth: 30,
      lines: [{ cp: 20, mate: null, pv: ['e2e4'] }],
    })
    await renderApp('/analysis', s)
    const bar = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Evaluation bar' })
    const lines = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Best moves' })
    expect([bar.checked, lines.checked]).toEqual([true, true])
    expect(await screen.findByRole('img', { name: 'Evaluation +0.20' })).toBeTruthy()
    expect(screen.queryByTestId('evaluation-warning')).toBeNull()

    fireEvent.click(lines)
    await waitFor(() => expect(screen.queryByTestId('analysis-panel')).toBeNull())
    cleanup()
    await renderApp('/analysis', s)
    const again = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Best moves' })
    expect(again.checked).toBe(false)
    expect(screen.getByTestId('eval-bar')).toBeTruthy()
  })

  it('refuses a game still in play', async () => {
    const s = await app()
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await personMove(s.db, game.id, 'e2e4')
    await renderApp(`/analysis?game=${game.id}`, s)
    expect((await screen.findByTestId('paste-error')).textContent).toContain('once it has ended')
  })

  it('opens where the player left it after the app closed, and keeps the board as it changes', async () => {
    const s = await app()
    const writer = draftWriter(s.db, DRAFTS.analysis, 0)
    const tree = fromInput(STANDARD_START, [
      { uci: 'd2d4', children: [{ uci: 'd7d5', children: [] }] },
    ])
    writer.write({ startFen: STANDARD_START, tree, path: [0, 0] })
    await writer.flush()
    await renderApp('/analysis', s)
    await waitFor(() => expect(screen.getByTestId('move-tree').textContent).toContain('d5'))
    fireEvent.change(await screen.findByLabelText('FEN or PGN'), { target: { value: '1. e4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    await waitFor(async () => expect((await loadBoardDraft(s.db))?.tree[0]?.san).toBe('e4'), {
      timeout: 2000,
    })
  })
})
