import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  answerArrows,
  cleanFilters,
  excludeIds,
  firstMoveLabel,
  initialSession,
  isTrainingId,
  isTrainingMode,
  misses,
  progressStrip,
  promptText,
  sanOf,
  scoreText,
  sessionReducer,
  setComplete,
  sourceText,
  surname,
  useAnswerBoard,
  verdictText,
} from './training-model.ts'
import type {
  SessionState,
  TrainingItem,
  TrainingSource,
  TrainingVerdict,
} from './training-model.ts'

const AFTER_F3_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const LIBRARY: TrainingSource = {
  kind: 'library',
  libraryGameId: '0192f0c1-1111-7aaa-8bbb-123456789abc',
  white: 'Kasparov, Garry',
  black: 'Topalov, Veselin',
  event: 'Wijk aan Zee',
  year: 1999,
  ply: 47,
}

const GAME: TrainingSource = { kind: 'game', gameId: 'g', ply: 3, opponent: 'anna' }

const id = (n: number) => `p:${n.toString(16).padStart(32, '0')}`

const item = (n: number, over: Partial<TrainingItem> = {}): TrainingItem => ({
  id: id(n),
  mode: 'library',
  fen: AFTER_F3_E5,
  sideToMove: 'white',
  box: null,
  ...over,
})

const verdict = (over: Partial<TrainingVerdict> = {}): TrainingVerdict => ({
  correct: true,
  verdict: 'master',
  masterUci: 'b1c3',
  playedUci: null,
  acceptedUci: ['d2d4'],
  bestLine: ['d2d4', 'e5d4'],
  source: LIBRARY,
  box: 1,
  dueAt: '2026-10-11T00:00:00Z',
  learned: false,
  ...over,
})

/** A session with `answers` answered (right unless listed in `wrong`), the next position on the board. */
function played(
  answers: number,
  wrong: ReadonlyArray<number> = [],
  length: 10 | 'endless' = 10,
): SessionState {
  let s = sessionReducer(initialSession({ ...DEFAULT_SETTINGS, length }), {
    type: 'started',
    next: { item: item(0), pool: 50 },
  })
  for (let i = 0; i < answers; i++) {
    s = sessionReducer(s, { type: 'played', uci: 'b1c3' })
    s = sessionReducer(s, { type: 'answered', verdict: verdict({ correct: !wrong.includes(i) }) })
    s = sessionReducer(s, { type: 'next', next: { item: item(i + 1), pool: 50 } })
  }
  return s
}

describe('input checks', () => {
  it('knows the modes and each mode’s ids', () => {
    expect(isTrainingMode('games')).toBe(true)
    expect(isTrainingMode('practice')).toBe(false)
    expect(isTrainingId('library', id(1))).toBe(true)
    expect(isTrainingId('games', `g:${'a'.repeat(32)}:41`)).toBe(true)
    expect(isTrainingId('games', id(1))).toBe(false)
    expect(isTrainingId('library', `p:${'A'.repeat(32)}`)).toBe(false)
    expect(isTrainingId('library', `p:${'a'.repeat(32)}/../x`)).toBe(false)
  })

  it('trims and limits the filters, and drops what is not a filter', () => {
    expect(
      cleanFilters({
        opening: '  Najdorf ',
        phase: 'endgame',
        player: 'x'.repeat(150),
        from: 1999,
        to: 3000,
      }),
    ).toEqual({ opening: 'Najdorf', phase: 'endgame', player: 'x'.repeat(100), from: 1999 })
    expect(cleanFilters({ opening: '  ', phase: 'any' })).toEqual({})
    expect(cleanFilters({ phase: 'opening' as never, from: 1999.5 })).toEqual({})
    expect(cleanFilters(undefined)).toEqual({})
  })
})

describe('session', () => {
  afterEach(cleanup)

  it('starts with the first position, or says the pool is empty', () => {
    const s = sessionReducer(initialSession(), {
      type: 'started',
      next: { item: item(0), pool: 3 },
    })
    expect(s.stage).toBe('play')
    expect(s.item?.id).toBe(id(0))
    expect(s.pool).toBe(3)
    const empty = sessionReducer(initialSession(), {
      type: 'started',
      next: { item: null, pool: 0 },
    })
    expect(empty).toMatchObject({ stage: 'start', empty: true, pool: 0 })
  })

  it('takes one move per position and keeps its verdict', () => {
    let s = played(0)
    s = sessionReducer(s, { type: 'played', uci: 'b1c3' })
    expect(sessionReducer(s, { type: 'played', uci: 'd2d4' }).played).toBe('b1c3')
    s = sessionReducer(s, { type: 'answered', verdict: verdict() })
    expect(s.answers).toHaveLength(1)
    expect(sessionReducer(s, { type: 'answered', verdict: verdict() }).answers).toHaveLength(1)
    expect(s.answers[0]).toMatchObject({ uci: 'b1c3', item: { id: id(0) } })
  })

  it('a refused answer lets the member play again', () => {
    let s = sessionReducer(played(0), { type: 'played', uci: 'b1c3' })
    s = sessionReducer(s, { type: 'refused' })
    expect(s.played).toBeNull()
    expect(s.answers).toHaveLength(0)
  })

  it('a set ends after its tenth answer, with a strip of ✓ ✗ ·', () => {
    const three = played(3, [1])
    expect(progressStrip(three)).toEqual(['✓', '✗', '✓', '·', '·', '·', '·', '·', '·', '·'])
    expect(setComplete(three)).toBe(false)
    let ten = played(9)
    ten = sessionReducer(ten, { type: 'played', uci: 'b1c3' })
    ten = sessionReducer(ten, { type: 'answered', verdict: verdict({ correct: false }) })
    expect(setComplete(ten)).toBe(true)
    expect(sessionReducer(ten, { type: 'next', next: { item: item(99), pool: 50 } }).stage).toBe(
      'summary',
    )
  })

  it('an endless session has no strip and ends with Finish or a dry pool', () => {
    const s = played(12, [], 'endless')
    expect(progressStrip(s)).toBeNull()
    expect(setComplete(s)).toBe(false)
    expect(sessionReducer(s, { type: 'finish' }).stage).toBe('summary')
    const dry = sessionReducer(
      sessionReducer(sessionReducer(s, { type: 'played', uci: 'b1c3' }), {
        type: 'answered',
        verdict: verdict(),
      }),
      { type: 'next', next: { item: null, pool: 13 } },
    )
    expect(dry.stage).toBe('summary')
    expect(dry.answers).toHaveLength(13)
  })

  it('finishing before any answer goes back to the start', () => {
    expect(sessionReducer(played(0), { type: 'finish' }).stage).toBe('start')
  })

  it('excludes every position of the session, the newest 100', () => {
    expect(excludeIds(played(2))).toEqual([id(0), id(1), id(2)])
    const long = excludeIds(played(120, [], 'endless'))
    expect(long).toHaveLength(100)
    expect(long.at(-1)).toBe(id(120))
    expect(long[0]).toBe(id(21))
  })

  it('scores the answers, lists the misses and revisits one from the summary', () => {
    const s = sessionReducer(played(4, [0, 2], 'endless'), { type: 'finish' })
    expect(scoreText(s.answers)).toBe('2 / 4')
    expect(misses(s.answers)).toEqual([0, 2])
    expect(sessionReducer(s, { type: 'revisit', index: 2 }).revisit).toBe(2)
    expect(sessionReducer(s, { type: 'revisit', index: 9 }).revisit).toBeNull()
  })

  it('changing settings starts over', () => {
    const s = sessionReducer(played(3), {
      type: 'settings',
      settings: { mode: 'library', filters: { phase: 'endgame' }, length: 'endless' },
    })
    expect(s).toMatchObject({ stage: 'start', answers: [], item: null, empty: false })
    expect(s.settings.filters).toEqual({ phase: 'endgame' })
  })
})

describe('words', () => {
  it('names players by surname and moves in SAN', () => {
    expect(surname('Kasparov, Garry')).toBe('Kasparov')
    expect(surname('Magnus Carlsen')).toBe('Carlsen')
    expect(surname('anna')).toBe('anna')
    expect(sanOf(AFTER_F3_E5, 'b1c3')).toBe('Nc3')
    expect(sanOf(AFTER_F3_E5, 'a1a8')).toBe('a1a8')
    expect(firstMoveLabel(AFTER_F3_E5, 'Nc3')).toBe('2.Nc3')
    expect(firstMoveLabel(AFTER_E4, 'e5')).toBe('1...e5')
  })

  it('asks for the side to move', () => {
    expect(promptText({ sideToMove: 'white' })).toBe('White to move: find the best move')
    expect(promptText({ sideToMove: 'black' })).toBe('Black to move: find the best move')
  })

  it('says whose move it was in master games', () => {
    const at = item(0)
    expect(verdictText(at, verdict())).toBe('The move Kasparov played.')
    expect(verdictText(at, verdict({ verdict: 'engine' }))).toBe(
      'Engine approves (Kasparov played Nc3).',
    )
    expect(verdictText(at, verdict({ verdict: 'both' }))).toBe(
      'The move Kasparov played — the engine agrees.',
    )
    expect(verdictText(at, verdict({ verdict: 'none', correct: false }))).toBe(
      'Not this time. Kasparov played Nc3.',
    )
    expect(
      verdictText(item(0, { sideToMove: 'black', fen: AFTER_E4 }), verdict({ masterUci: 'e7e5' })),
    ).toBe('The move Topalov played.')
  })

  it('names the move played in the member’s own game', () => {
    const at = item(0, { mode: 'games' })
    const mine = verdict({ verdict: 'engine', source: GAME, masterUci: null, playedUci: 'g2g4' })
    expect(verdictText(at, mine)).toBe('Engine approves (you played g4 in the game).')
    expect(verdictText(at, { ...mine, correct: false, verdict: 'none' })).toBe(
      'Not this time. You played g4 in the game.',
    )
  })

  it('says where the position comes from', () => {
    expect(sourceText(LIBRARY)).toBe('Kasparov–Topalov, Wijk aan Zee 1999, move 24')
    expect(sourceText({ ...LIBRARY, event: null, year: null, ply: 0 })).toBe(
      'Kasparov–Topalov, move 1',
    )
    expect(sourceText(GAME)).toBe('Your game against anna, move 2')
  })

  it('draws the engine’s move and the master’s when it is another', () => {
    expect(answerArrows(verdict())).toEqual([
      { from: 'd2', to: 'd4' },
      { from: 'b1', to: 'c3' },
    ])
    expect(answerArrows(verdict({ masterUci: 'd2d4' }))).toEqual([{ from: 'd2', to: 'd4' }])
    expect(answerArrows(verdict({ source: GAME, playedUci: 'g2g4' }))).toEqual([
      { from: 'd2', to: 'd4' },
    ])
  })
})

describe('useAnswerBoard', () => {
  afterEach(cleanup)

  it('sends the first legal move by click or drop', () => {
    const onPlay = vi.fn()
    const { result } = renderHook(() => useAnswerBoard(AFTER_F3_E5, true, onPlay))
    act(() => result.current.onSquareClick('d2'))
    act(() => result.current.onSquareClick('d4'))
    expect(onPlay).toHaveBeenCalledWith('d2d4')
    act(() => {
      expect(result.current.onDrop('g2', 'g5')).toBe(false)
    })
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('asks for the promotion piece', () => {
    const onPlay = vi.fn()
    const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'
    const { result } = renderHook(() => useAnswerBoard(fen, true, onPlay))
    act(() => {
      result.current.onDrop('e7', 'e8')
    })
    expect(result.current.promotion).toEqual({ from: 'e7', to: 'e8' })
    act(() => result.current.pickPromotion('n'))
    expect(onPlay).toHaveBeenCalledWith('e7e8n')
  })

  it('takes nothing while disabled', () => {
    const onPlay = vi.fn()
    const { result } = renderHook(() => useAnswerBoard(AFTER_F3_E5, false, onPlay))
    act(() => {
      result.current.onDrop('d2', 'd4')
    })
    act(() => result.current.onSquareClick('d2'))
    expect(onPlay).not.toHaveBeenCalled()
    expect(result.current.selected).toBeNull()
  })
})
