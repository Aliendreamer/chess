import { readFileSync, readdirSync } from 'node:fs'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { positionKey } from './analysis.ts'
import { STANDARD_START } from './tree.ts'
import { dedupeKey, parseOpening, prepareImport, readOpenings, yearOf } from './library.ts'
import type { ImportGame, LibraryGame, LibraryGamePosition } from './library.ts'

// The backend's LibraryImportTests and OpeningSeedTests, case for case.

const SOURCE = {
  source: 'PGN Mentor',
  licence: 'moves only (facts)',
  sourceRef: 'WorldChamp1972.pgn',
}
const OPENINGS = new Map(
  [
    parseOpening('C20', "King's Pawn Game", '1. e4 e5')!,
    parseOpening('C40', "King's Knight Opening", '1. e4 e5 2. Nf3')!,
  ].map((o) => [o.key, o]),
)
const game = (...moves: Array<string>): ImportGame => ({
  white: 'Fischer, Robert James',
  black: 'Spassky, Boris V',
  event: 'World Championship 28th',
  site: 'Reykjavik',
  round: '6',
  date: '1972.07.23',
  result: '1-0',
  eco: null,
  moves,
  startFen: null,
})
const prepared = (g: ImportGame) => {
  const r = prepareImport(g, SOURCE, OPENINGS, 'id-1')
  if (!r.ok) throw new Error(r.error)
  return r as { game: LibraryGame; positions: Array<LibraryGamePosition> }
}
const replayed = (moves: Array<string>) => {
  const b = new Chess()
  for (const m of moves) b.move({ from: m.slice(0, 2), to: m.slice(2, 4) })
  return b.fen()
}

describe('library import (LibraryImportTests)', () => {
  it('keeps every position of a legal game and its deepest opening', () => {
    const { game: g, positions } = prepared(game('e2e4', 'e7e5', 'g1f3', 'b8c6'))
    expect([g.white, g.black, g.year, g.dateText, g.ply]).toEqual([
      'Fischer, Robert James',
      'Spassky, Boris V',
      1972,
      '1972.07.23',
      4,
    ])
    expect([g.eco, g.openingName]).toEqual(['C40', "King's Knight Opening"])
    expect(positions.map((p) => p.ply)).toEqual([0, 1, 2, 3, 4])
    expect(positions.at(-1)?.positionKey).toBe(
      positionKey(replayed(['e2e4', 'e7e5', 'g1f3', 'b8c6'])),
    )
    expect(positions.every((p) => p.gameId === 'id-1')).toBe(true)
    expect([g.source, g.licence, g.sourceRef]).toEqual([
      'PGN Mentor',
      'moves only (facts)',
      'WorldChamp1972.pgn',
    ])
  })

  it('lets the game’s own ECO win over the list', () => {
    const { game: g } = prepared({ ...game('e2e4', 'e7e5', 'g1f3'), eco: 'C41' })
    expect([g.eco, g.openingName]).toEqual(['C41', "King's Knight Opening"])
  })

  it('refuses an illegal move, naming it', () => {
    const r = prepareImport(game('e2e4', 'e7e4'), SOURCE, OPENINGS, 'id')
    expect(!r.ok && r.error).toContain('move 2 (e7e4)')
  })

  it('refuses a game from another position, without moves, or without both players', () => {
    const refused = (g: ImportGame) => !prepareImport(g, SOURCE, OPENINGS, 'id').ok
    expect(refused({ ...game('e2e4'), startFen: '8/8/8/8/8/8/k7/4K3 w - - 0 1' })).toBe(true)
    expect(refused(game())).toBe(true)
    expect(refused({ ...game('e2e4'), white: ' ' })).toBe(true)
    expect(refused({ ...game('e2e4'), white: '?' })).toBe(true) // PGN for "unknown"
    expect(refused({ ...game('e2e4'), black: '??' })).toBe(true)
    expect(refused({ ...game('e2e4'), result: '2-0' })).toBe(true)
  })

  it.each([
    ['1886.??.??', 1886],
    ['1972.07.11', 1972],
    ['????.??.??', null],
    [null, null],
  ])('takes the year of %s as %s', (date, year) => {
    expect(yearOf(date)).toBe(year)
  })

  it('keys the same game once whatever the spelling of its players', () => {
    const a = dedupeKey('Fischer, Robert James', 'Spassky,  Boris V', 1972, ['e2e4', 'e7e5'])
    const b = dedupeKey(' fischer, robert james', 'SPASSKY, BORIS V', 1972, ['e2e4', 'e7e5'])
    expect(a).toBe(b)
    expect(dedupeKey('Fischer, Robert James', 'Spassky, Boris V', 1972, ['e2e4', 'c7c5'])).not.toBe(
      a,
    )
  })

  it('carries the next move, the result and the source on each position from the start', () => {
    const { positions } = prepared(game('e2e4', 'e7e5', 'g1f3'))
    expect(positions.map((p) => [p.ply, p.nextUci])).toEqual([
      [0, 'e2e4'],
      [1, 'e7e5'],
      [2, 'g1f3'],
      [3, null],
    ])
    expect(positions[0]?.positionKey).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
    expect(positions.every((p) => p.result === '1-0' && p.source === 'PGN Mentor')).toBe(true)
  })

  it('plays on past an unclaimed repetition', () => {
    const shuffle = Array.from({ length: 3 }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat()
    expect(prepared(game(...shuffle, 'e2e4')).game.ply).toBe(13)
  })
})

describe('the openings list (OpeningSeedTests)', () => {
  it('replays a row to its position', () => {
    const berlin = parseOpening(
      'C67',
      'Ruy Lopez: Berlin Defense',
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O',
    )!
    expect(berlin.key).toBe(
      positionKey(replayed(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1'])),
    )
    expect(berlin.movesUci).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1'])
  })

  it('skips a row that does not replay', () => {
    expect(parseOpening('A00', 'Nonsense', '1. e5')).toBeNull()
    expect(parseOpening('A00', 'Empty', '')).toBeNull()
  })

  it('names thousands of positions once each from the embedded files', () => {
    const dir = new URL('../../../apps/backend/Library/Openings/', import.meta.url)
    const files = readdirSync(dir).map((f) => readFileSync(new URL(f, dir), 'utf8'))
    const all = readOpenings(files)
    expect(all.length).toBeGreaterThan(3000)
    expect(new Set(all.map((o) => o.key)).size).toBe(all.length)
    expect(all.some((o) => o.eco === 'B20' && o.name === 'Sicilian Defense')).toBe(true)
    expect(all.some((o) => o.key === positionKey(STANDARD_START))).toBe(false)
  }, 60_000) // thousands of replays: slow under coverage
})
