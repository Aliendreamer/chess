import { describe, expect, it } from 'vitest'
import {
  category,
  formatClock,
  isGameView,
  liveClocks,
  mergeMoves,
  myColor,
  orientation,
  pairMoves,
  reasonText,
  resultText,
  topicId,
} from './games'
import type { GameView } from './games'

const view: GameView = {
  gameId: '0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f',
  whiteId: 1,
  blackId: 2,
  timeControl: '5+3',
  status: 'Playing',
  fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  ply: 2,
  sideToMove: 'White',
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
  ])('%s → %s', (result, text) => {
    expect(resultText(result)).toBe(text)
  })

  it.each([
    ['Checkmate', 'checkmate'],
    ['ThreefoldRepetition', 'threefold repetition'],
    ['FiftyMoveRule', '50-move rule'],
    ['Agreement', 'draw agreed'],
    ['Timeout', 'time'],
    ['TimeoutVsInsufficientMaterial', 'time vs insufficient material'],
    ['Aborted', 'aborted'],
    ['SomethingNew', 'something new'],
  ])('%s → %s', (reason, text) => {
    expect(reasonText(reason)).toBe(text)
  })
})

describe('liveClocks', () => {
  it('counts down only the side to move', () => {
    expect(liveClocks(view, 1500)).toEqual({ whiteMs: 298500, blackMs: 297000 })
    expect(liveClocks({ ...view, sideToMove: 'Black' }, 1500)).toEqual({
      whiteMs: 300000,
      blackMs: 295500,
    })
  })

  it('stops at zero rather than going negative', () => {
    expect(liveClocks(view, 400000)).toEqual({ whiteMs: 0, blackMs: 297000 })
  })

  it('does not run before both first moves or after the end', () => {
    expect(liveClocks({ ...view, ply: 1, sideToMove: 'Black' }, 5000)).toEqual({
      whiteMs: 300000,
      blackMs: 297000,
    })
    expect(liveClocks({ ...view, status: 'Created', ply: 0 }, 5000)).toEqual({
      whiteMs: 300000,
      blackMs: 297000,
    })
    expect(liveClocks({ ...view, status: 'Ended' }, 5000)).toEqual({
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
