import { describe, expect, it } from 'vitest'
import {
  CORRESPONDENCE,
  UNTIMED,
  category,
  engineToMove,
  formatClock,
  hasClock,
  isGameView,
  liveClocks,
  mergeMoves,
  myColor,
  orientation,
  pairMoves,
  reasonText,
  resultText,
  timeLeft,
  topicId,
} from './games'
import type { EndReason, GameView } from './games'

const view: GameView = {
  gameId: '0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f',
  whiteId: 1,
  blackId: 2,
  timeControl: '5+3',
  status: 'playing',
  fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  ply: 2,
  sideToMove: 'white',
  lastUci: 'e7e5',
  lastSan: 'e5',
  whiteMs: 300000,
  blackMs: 297000,
  clockAt: '2026-09-26T10:00:00+00:00',
  drawOfferedBy: null,
  result: null,
  reason: null,
  seq: 3,
}

describe('formatClock', () => {
  it.each([
    [183000, '3:03'],
    [300000, '5:00'],
    [5400000, '1:30:00'],
    [10000, '0:10'],
    [9500, '0:09.5'],
    [9549, '0:09.5'],
    [0, '0:00'],
    [-1200, '0:00'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text)
  })
})

describe('pairMoves', () => {
  it('groups SAN into numbered rows, the last one possibly half', () => {
    expect(pairMoves(['e4', 'e5', 'Nf3'])).toEqual([['e4', 'e5'], ['Nf3']])
    expect(pairMoves([])).toEqual([])
  })
})

describe('myColor and orientation', () => {
  it('knows the players and turns a spectator toward White', () => {
    expect(myColor(view, 1)).toBe('white')
    expect(myColor(view, 2)).toBe('black')
    expect(myColor(view, 9)).toBeNull()
    expect(orientation(view, 2)).toBe('black')
    expect(orientation(view, 9)).toBe('white')
  })
})

describe('resultText and reasonText', () => {
  it.each([
    ['1-0', '1–0'],
    ['0-1', '0–1'],
    ['1/2-1/2', '½'],
    ['*', '—'],
  ] as const)('%s → %s', (result, text) => {
    expect(resultText(result)).toBe(text)
  })

  it.each([
    ['checkmate', 'checkmate'],
    ['threefoldRepetition', 'threefold repetition'],
    ['fiftyMoveRule', '50-move rule'],
    ['agreement', 'draw agreed'],
    ['timeout', 'time'],
    ['timeoutVsInsufficientMaterial', 'time vs insufficient material'],
    ['aborted', 'aborted'],
    ['abandonment', 'abandonment'],
  ] as const)('%s → %s', (reason, text) => {
    expect(reasonText(reason)).toBe(text)
  })

  it('shows a reason newer than the page as sent', () => {
    expect(reasonText('somethingNew' as EndReason)).toBe('somethingNew')
  })
})

describe('liveClocks', () => {
  it('counts down only the side to move', () => {
    expect(liveClocks(view, 1500)).toEqual({ whiteMs: 298500, blackMs: 297000 })
    expect(liveClocks({ ...view, sideToMove: 'black' }, 1500)).toEqual({
      whiteMs: 300000,
      blackMs: 295500,
    })
  })

  it('stops at zero rather than going negative', () => {
    expect(liveClocks(view, 400000)).toEqual({ whiteMs: 0, blackMs: 297000 })
  })

  it('does not run before both first moves or after the end', () => {
    expect(liveClocks({ ...view, ply: 1, sideToMove: 'black' }, 5000)).toEqual({
      whiteMs: 300000,
      blackMs: 297000,
    })
    expect(liveClocks({ ...view, status: 'created', ply: 0 }, 5000)).toEqual({
      whiteMs: 300000,
      blackMs: 297000,
    })
    expect(liveClocks({ ...view, status: 'ended' }, 5000)).toEqual({
      whiteMs: 300000,
      blackMs: 297000,
    })
  })
})

describe('mergeMoves', () => {
  it('keeps the list when the frame is at the same ply', () => {
    expect(mergeMoves(['e4', 'e5'], view)).toEqual({ kind: 'same' })
  })

  it('appends the last SAN when the frame is one ply ahead', () => {
    expect(mergeMoves(['e4'], view)).toEqual({ kind: 'append', sans: ['e4', 'e5'] })
  })

  it('asks for a refetch on any other jump', () => {
    expect(mergeMoves([], view)).toEqual({ kind: 'refetch' })
    expect(mergeMoves(['e4', 'e5', 'Nf3'], view)).toEqual({ kind: 'refetch' })
    expect(mergeMoves(['e4'], { ...view, lastSan: null })).toEqual({ kind: 'refetch' })
  })
})

describe('isGameView', () => {
  it('accepts a view and rejects anything else', () => {
    expect(isGameView(view)).toBe(true)
    expect(isGameView({ ...view, absentId: 22, claimableBy: 11 })).toBe(true)
    expect(isGameView({ ...view, fen: 3 })).toBe(false)
    expect(isGameView({ count: 1 })).toBe(false)
    expect(isGameView(null)).toBe(false)
  })
})

describe('topicId', () => {
  it('drops the dashes a JSON guid has', () => {
    expect(topicId('0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f')).toBe('0199f1c2a3b47c5d8e9f0a1b2c3d4e5f')
    expect(topicId('0199f1c2a3b47c5d8e9f0a1b2c3d4e5f')).toBe('0199f1c2a3b47c5d8e9f0a1b2c3d4e5f')
  })
})

describe('category', () => {
  it.each([
    ['1+0', 'Bullet'],
    ['2+1', 'Bullet'],
    ['3+0', 'Blitz'],
    ['5+3', 'Blitz'],
    ['10+0', 'Rapid'],
    ['15+10', 'Rapid'],
    ['30+20', 'Classical'],
    ['90+30', 'Classical'],
  ])('%s is %s', (tc, name) => {
    expect(category(tc)).toBe(name)
  })
})

describe('games against the computer', () => {
  it('names the untimed control', () => {
    expect(category(UNTIMED)).toBe('Untimed')
    expect(category('5+3')).toBe('Blitz')
  })

  it("is the computer's turn only in its game, on its side, while playing", () => {
    expect(engineToMove({ engineSide: 'black', status: 'playing', sideToMove: 'black' })).toBe(true)
    expect(engineToMove({ engineSide: 'black', status: 'playing', sideToMove: 'white' })).toBe(
      false,
    )
    expect(engineToMove({ engineSide: 'white', status: 'created', sideToMove: 'white' })).toBe(true)
    expect(engineToMove({ engineSide: 'white', status: 'ended', sideToMove: 'white' })).toBe(false)
    expect(engineToMove({ engineSide: null, status: 'playing', sideToMove: 'white' })).toBe(false)
  })
})

describe('correspondence games', () => {
  it('have no clock and their own category', () => {
    expect(hasClock(CORRESPONDENCE)).toBe(false)
    expect(hasClock(UNTIMED)).toBe(false)
    expect(hasClock('5+3')).toBe(true)
    expect(category(CORRESPONDENCE)).toBe('Correspondence')
  })

  it('say how long is left in the largest whole unit', () => {
    const now = Date.parse('2026-09-27T10:00:00Z')
    expect(timeLeft('2026-10-04T10:00:00Z', now)).toBe('7 days left')
    expect(timeLeft('2026-10-04T09:59:00Z', now)).toBe('7 days left') // a fresh week, a minute in
    expect(timeLeft('2026-10-03T21:00:00Z', now)).toBe('6 days left')
    expect(timeLeft('2026-09-28T11:00:00Z', now)).toBe('1 day left')
    expect(timeLeft('2026-09-27T15:30:00Z', now)).toBe('5 hours left')
    expect(timeLeft('2026-09-27T10:12:00Z', now)).toBe('12 minutes left')
    expect(timeLeft('2026-09-27T10:00:30Z', now)).toBe('less than a minute left')
    expect(timeLeft('2026-09-27T09:00:00Z', now)).toBe('less than a minute left')
  })
})
