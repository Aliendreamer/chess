import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeadLetterList } from './admin'
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
