import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bookLink,
  graphPoints,
  isAccepted,
  markOf,
  marksFor,
  practiceSide,
  scoreLabel,
  usePracticeBoard,
  useReview,
} from './review'
import type { ReviewView, ReviewedMove } from './review'

const move = (over: Partial<ReviewedMove> = {}): ReviewedMove => ({
  ply: 1,
  uci: 'f2f3',
  san: 'f3',
  cp: -50,
  mate: null,
  chances: -0.09,
  bestUci: 'e2e4',
  bestSan: 'e4',
  line: ['e4'],
  class: 'inaccuracy',
  ...over,
})

const view = (over: Partial<ReviewView> = {}): ReviewView => ({
  status: 'running',
  evaluated: 1,
  positions: 4,
  moves: [],
  white: { inaccuracies: 0, mistakes: 0, blunders: 0 },
  black: { inaccuracies: 0, mistakes: 0, blunders: 0 },
  bookExit: null,
  ...over,
})

describe('marks and scores', () => {
  it('writes a class as the usual annotation', () => {
    expect(
      (['none', 'inaccuracy', 'mistake', 'blunder', null] as const).map((c) => markOf(c)),
    ).toEqual(['', '?!', '?', '??', ''])
    expect(marksFor([move(), move({ ply: 2, class: 'blunder' })])).toEqual(['?!', '??'])
  })

  it('shows a score from White’s side, a mate as #', () => {
    expect(scoreLabel(move({ cp: 35 }))).toBe('+0.35')
    expect(scoreLabel(move({ cp: -120 }))).toBe('−1.20')
    expect(scoreLabel(move({ cp: null, mate: -2 }))).toBe('#−2')
    expect(scoreLabel(move({ cp: null, mate: null, chances: -1 }))).toBe('0–1')
    expect(scoreLabel(move({ cp: null, mate: null, chances: null }))).toBe('…')
  })
})

describe('graphPoints', () => {
  it('runs from the start at the middle, White up, and skips moves not evaluated yet', () => {
    const points = graphPoints(
      [move({ chances: 0.5 }), move({ ply: 2, chances: null }), move({ ply: 3, chances: -1 })],
      300,
      100,
    )
    expect(points).toEqual([
      { ply: 0, x: 0, y: 50 },
      { ply: 1, x: 100, y: 25 },
      { ply: 3, x: 300, y: 100 },
    ])
  })
})

describe('book and practice', () => {
  it('links the trainer for the opening the member left, as their colour', () => {
    expect(
      bookLink(
        {
          ply: 7,
          san: 'Bd6',
          color: 'black',
          eco: 'D30',
          name: "Queen's Gambit Declined: Ragozin",
        },
        'black',
      ),
    ).toEqual({ family: "Queen's Gambit Declined", color: 'black' })
    expect(
      bookLink({ ply: 7, san: 'Bd6', color: 'black', eco: 'D30', name: 'X' }, 'white'),
    ).toBeNull()
  })

  it('accepts any of the engine’s moves, promotion included, and plays from the side to move', () => {
    expect(isAccepted('b1c3', ['b1c3', 'd2d4'])).toBe(true)
    expect(isAccepted('e7e8n', ['e7e8q'])).toBe(false)
    expect(practiceSide('rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2')).toBe(
      'white',
    )
  })
})

describe('useReview', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('polls while running and stops once complete', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn<() => Promise<ReviewView>>()
      .mockResolvedValueOnce(view({ evaluated: 3 }))
      .mockResolvedValue(view({ status: 'complete', evaluated: 4 }))
    const { result } = renderHook(() => useReview(view(), load, vi.fn(), 2000))
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(result.current.view?.evaluated).toBe(3)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(result.current.view?.status).toBe('complete')
    await act(() => vi.advanceTimersByTimeAsync(6000))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads the review once the game has ended', async () => {
    const load = vi.fn<() => Promise<ReviewView>>().mockResolvedValue(view({ status: 'complete' }))
    const { result, rerender } = renderHook(
      ({ ended }) => useReview(null, load, vi.fn(), 2000, ended),
      {
        initialProps: { ended: false },
      },
    )
    expect(load).not.toHaveBeenCalled()
    rerender({ ended: true })
    await act(() => Promise.resolve())
    expect(result.current.view?.status).toBe('complete')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('starting a review shows its answer and starts the polling', async () => {
    vi.useFakeTimers()
    const load = vi.fn<() => Promise<ReviewView>>().mockResolvedValue(view({ evaluated: 2 }))
    const start = vi.fn().mockResolvedValue({ ok: true, view: view() })
    const { result } = renderHook(() => useReview(view({ status: 'none' }), load, start, 2000))
    await act(() => vi.advanceTimersByTimeAsync(4000))
    expect(load).not.toHaveBeenCalled()
    await act(() => result.current.start())
    expect(result.current.view?.status).toBe('running')
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(result.current.view?.evaluated).toBe(2)
  })
})

describe('usePracticeBoard', () => {
  afterEach(cleanup)
  const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'

  it('judges the first move played, once', () => {
    const onAnswer = vi.fn()
    const { result } = renderHook(() =>
      usePracticeBoard({ fen: AFTER_E5, acceptedUci: ['b1c3', 'd2d4'] }, onAnswer),
    )
    act(() => result.current.onSquareClick('d2'))
    act(() => result.current.onSquareClick('d4'))
    expect(result.current.answer).toEqual({ uci: 'd2d4', correct: true })
    act(() => {
      result.current.onDrop('g2', 'g4')
    })
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith(true)
  })

  it('a wrong move or asking for the answer is a wrong answer', () => {
    const onAnswer = vi.fn()
    const { result } = renderHook(() =>
      usePracticeBoard({ fen: AFTER_E5, acceptedUci: ['b1c3'] }, onAnswer),
    )
    act(() => {
      result.current.onDrop('g2', 'g4')
    })
    expect(result.current.answer).toEqual({ uci: 'g2g4', correct: false })
    const other = renderHook(() =>
      usePracticeBoard({ fen: AFTER_E5, acceptedUci: ['b1c3'] }, onAnswer),
    )
    act(() => other.result.current.reveal())
    expect(other.result.current.answer).toEqual({ uci: null, correct: false })
  })
})
