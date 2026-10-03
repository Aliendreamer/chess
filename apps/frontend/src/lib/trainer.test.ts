import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fenAfter, isMemberMove, lineState, lineText, matches, sanAt, useDrill } from './trainer'
import type { TrainerLine } from './trainer'

const BERLIN: TrainerLine = {
  key: 'k',
  name: 'Ruy Lopez: Berlin Defense',
  eco: 'C65',
  moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6'],
  box: null,
  dueAt: null,
}

describe('drill rules', () => {
  it('knows whose move each ply is', () => {
    expect([0, 1, 2].map((p) => isMemberMove(p, 'white'))).toEqual([true, false, true])
    expect([0, 1, 2].map((p) => isMemberMove(p, 'black'))).toEqual([false, true, false])
  })

  it('checks a move against the line, promotion included', () => {
    expect(matches('e2e4', 'e2e4')).toBe(true)
    expect(matches('e2e3', 'e2e4')).toBe(false)
    expect(matches('e7e8q', 'e7e8q')).toBe(true)
    expect(matches('e7e8n', 'e7e8q')).toBe(false)
  })

  it('finds the position after some of the line', () => {
    expect(fenAfter(BERLIN.moves, 0).split(' ')[0]).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
    )
    expect(fenAfter(BERLIN.moves, 1).split(' ')[0]).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR',
    )
  })
})

describe('useDrill', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('plays the other side, waits for the member, and finishes clean', async () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    const { result } = renderHook(() => useDrill(BERLIN, 'black', onDone, 300))
    expect(result.current.ply).toBe(0)
    await act(() => vi.advanceTimersByTimeAsync(300)) // the board plays 1.e4
    expect(result.current.ply).toBe(1)
    expect(result.current.yourMove).toBe(true)

    act(() => result.current.play('e7e5'))
    await act(() => vi.advanceTimersByTimeAsync(300)) // 2.Nf3
    act(() => result.current.play('b8c6'))
    await act(() => vi.advanceTimersByTimeAsync(300)) // 3.Bb5
    act(() => result.current.play('g8f6'))
    expect(result.current.done).toBe(true)
    expect(onDone).toHaveBeenCalledWith(0)
  })

  it('shows a wrong move with the right one, counts it, and goes on only after the right move', async () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    const { result } = renderHook(() => useDrill(BERLIN, 'white', onDone, 300))
    act(() => result.current.play('d2d4'))
    expect(result.current.wrong).toEqual({ played: 'd2d4', expected: 'e2e4' })
    expect(result.current.ply).toBe(0)
    act(() => result.current.play('e2e4'))
    expect(result.current.wrong).toBeNull()
    expect(result.current.mistakes).toBe(1)
    expect(result.current.ply).toBe(1)
  })

  it('takes moves from the board by click or drag; a wrong drop goes back', () => {
    const { result } = renderHook(() => useDrill(BERLIN, 'white', vi.fn(), 300))
    let kept = true
    act(() => {
      kept = result.current.onDrop('d2', 'd4')
    })
    expect(kept).toBe(false)
    expect(result.current.mistakes).toBe(1)
    act(() => result.current.onSquareClick('e2'))
    expect(result.current.selected).toBe('e2')
    act(() => result.current.onSquareClick('e4'))
    expect(result.current.ply).toBe(1)
    expect(result.current.onDrop('g1', 'f3')).toBe(false) // not the member's turn
  })

  it('a line that ends on the other side finishes after the board plays it', async () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    const { result } = renderHook(() => useDrill(BERLIN, 'white', onDone, 300))
    for (const uci of ['e2e4', 'g1f3', 'f1b5']) {
      act(() => result.current.play(uci))
      await act(() => vi.advanceTimersByTimeAsync(300))
    }
    expect(result.current.done).toBe(true)
    expect(onDone).toHaveBeenCalledWith(0)
  })
})

describe('labels', () => {
  it('names a line by its box', () => {
    expect([null, 0, 2, 3, 5].map((box) => lineState({ box }))).toEqual([
      'new',
      'learning',
      'learning',
      'learned',
      'learned',
    ])
  })

  it('writes a move of the line in numbered notation', () => {
    expect(sanAt(BERLIN.moves, 5)).toBe('3...Nf6')
    expect(sanAt(BERLIN.moves, 4)).toBe('3.Bb5')
    expect(sanAt(BERLIN.moves, 5, 'a7a6')).toBe('3...a6')
    expect(lineText(BERLIN.moves, 3)).toBe('1.e4 e5 2.Nf3')
    expect(lineText(BERLIN.moves, 0)).toBe('')
  })
})
