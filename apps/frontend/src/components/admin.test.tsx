import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeadLetterList, LibraryImportForm } from './admin'
import type { DeadLetter } from '#/lib/admin'

afterEach(cleanup)

const letter = (id: string, aggregateId: string): DeadLetter => ({
  id,
  groupId: 'chess.rm-games',
  aggregateId,
  seq: 4,
  kafkaKey: aggregateId,
  value: '{}',
  attempts: 5,
  lastError: 'ProjectionGapException: expected seq 3\n   at Chess.Backend.Projections.Run()',
  firstFailedAt: '2026-10-02T09:00:00Z',
  parkedAt: '2026-10-02T09:01:00Z',
})

describe('DeadLetterList', () => {
  it('says when nothing is parked', () => {
    render(<DeadLetterList letters={[]} onReplay={vi.fn()} />)
    expect(screen.getByText('Nothing is parked.')).toBeTruthy()
  })

  it('lists each record with its first error line and the whole error on demand', () => {
    render(<DeadLetterList letters={[letter('1', 'g1'), letter('2', 'g2')]} onReplay={vi.fn()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByText('ProjectionGapException: expected seq 3')).toHaveLength(2)
    expect(
      screen.getAllByText(/at Chess.Backend.Projections.Run/)[0]?.closest('details'),
    ).not.toBeNull()
    expect(screen.getAllByText('chess.rm-games')).toHaveLength(2)
  })

  it('replays one aggregate and shows how it went', async () => {
    const onReplay = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, applied: 3 })
      .mockResolvedValueOnce({ ok: false, error: 'still broken' })
    render(<DeadLetterList letters={[letter('1', 'g1'), letter('2', 'g2')]} onReplay={onReplay} />)
    const [first, second] = screen.getAllByRole('button', { name: /^Replay/ })

    fireEvent.click(first!)
    expect(await screen.findByText('Replayed 3.')).toBeTruthy()
    expect(onReplay).toHaveBeenCalledWith('chess.rm-games', 'g1')

    fireEvent.click(second!)
    expect(await screen.findByText('Failed again: still broken')).toBeTruthy()
  })
})

describe('LibraryImportForm (game-library)', () => {
  const PGN = [
    '[White "Anderssen"]\n[Black "Kieseritzky"]\n[Date "1851.??.??"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    '[White "Morphy"]\n[Black "Duke"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 1-0',
  ].join('\n\n')

  function fill(text: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'PGN' }), { target: { value: text } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Source' }), {
      target: { value: 'PGN Mentor' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Licence' }), {
      target: { value: 'moves only (facts)' },
    })
  }

  it('sends the parsed games with their source and reports what happened to each', async () => {
    const onImport = vi.fn().mockResolvedValue({
      ok: true,
      view: {
        imported: 1,
        duplicates: 0,
        refused: 1,
        items: [
          { index: 0, status: 'imported' },
          { index: 1, status: 'refused', error: 'Illegal move 4 (d7d6)' },
        ],
      },
    })
    render(<LibraryImportForm onImport={onImport} />)
    fill(PGN)
    fireEvent.click(screen.getByRole('checkbox', { name: 'World Championship games' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import to library' }))

    expect(await screen.findByText('Imported 1 · duplicates 0 · refused 1')).toBeTruthy()
    expect(screen.getByText('Game 2: Illegal move 4 (d7d6)')).toBeTruthy()
    const batch = onImport.mock.calls[0]![0]
    expect(batch).toMatchObject({
      source: 'PGN Mentor',
      licence: 'moves only (facts)',
      worldChampionship: true,
    })
    expect(batch.games.map((g: { white: string }) => g.white)).toEqual(['Anderssen', 'Morphy'])
  })

  it('stops and says why when the API refuses the batch', async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    render(<LibraryImportForm onImport={onImport} />)
    fill(PGN)
    fireEvent.click(screen.getByRole('button', { name: 'Import to library' }))
    expect(await screen.findByText('Forbidden')).toBeTruthy()
  })

  it('needs a source and a licence', () => {
    render(<LibraryImportForm onImport={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'PGN' }), { target: { value: PGN } })
    expect(screen.getByRole('button', { name: 'Import to library' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('says so when the text holds no game at all', async () => {
    const onImport = vi.fn()
    render(<LibraryImportForm onImport={onImport} />)
    fill('this is not a PGN file')
    fireEvent.click(screen.getByRole('button', { name: 'Import to library' }))
    expect(await screen.findByText('No PGN game was found in that text.')).toBeTruthy()
    expect(onImport).not.toHaveBeenCalled()
  })
})
