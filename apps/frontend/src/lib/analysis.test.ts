import { describe, expect, it } from 'vitest'
import { lineMoves, positionKey, remember, scoreText } from './analysis'
import type { Evaluation } from './analysis'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const START_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

const evaluation = (thinkMs: number, cp: number): Evaluation => ({
  thinkMs,
  depth: 20,
  lines: [{ cp, mate: null, pv: ['e2e4'] }],
})

describe('position keys, as the API makes them', () => {
  it.each([
    [START, START_KEY],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 40', START_KEY],
    [AFTER_E4, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -'],
    [
      'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3',
      'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
    ],
    [
      'rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3',
      'rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6',
    ],
  ])('%s → %s', (fen, key) => expect(positionKey(fen)).toBe(key))
})

describe('scores', () => {
  it.each([
    [{ cp: 35, mate: null }, '+0.35'],
    [{ cp: -120, mate: null }, '-1.20'],
    [{ cp: 0, mate: null }, '0.00'],
    [{ cp: null, mate: 3 }, '#3'],
    [{ cp: null, mate: -2 }, '#-2'],
  ])('%o reads %s', (line, text) => expect(scoreText(line)).toBe(text))
})

describe('engine lines', () => {
  it('become SAN moves, each with its position', () => {
    const moves = lineMoves(START, ['e2e4', 'e7e5', 'g1f3'])

    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(positionKey(moves[0]!.fen)).toBe(positionKey(AFTER_E4))
  })

  it('stop at a move chess.js refuses and at the limit', () => {
    expect(lineMoves(START, ['e2e4', 'e2e4', 'g1f3']).map((m) => m.san)).toEqual(['e4'])
    expect(lineMoves(START, ['e2e4', 'e7e5', 'g1f3'], 2)).toHaveLength(2)
  })
})

describe('answers', () => {
  it('keep the longest think known for each position', () => {
    const known = remember(new Map(), { key: 'a', evaluation: evaluation(3000, 10) })
    const pending = remember(known, { key: 'b', evaluation: null })
    const shorter = remember(pending, { key: 'a', evaluation: evaluation(1000, 99) })
    const deeper = remember(shorter, { key: 'a', evaluation: evaluation(10000, 20) })

    expect([...shorter.keys()]).toEqual(['a'])
    expect(shorter.get('a')!.lines[0]!.cp).toBe(10)
    expect(deeper.get('a')!.thinkMs).toBe(10000)
  })
})
