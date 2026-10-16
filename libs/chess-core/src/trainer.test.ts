import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { STANDARD_START, fromInput, toInput } from './tree.ts'
import {
  OpeningFamilies,
  afterRun,
  familyName,
  groupFamilies,
  isLearned,
  nextLine,
  openingKind,
  sha256,
  studyLines,
} from './trainer.ts'
import type { StudyMoveInput } from './tree.ts'
import type { Opening } from './trainer.ts'

// The backend's TrainerTests and StudyLinesTests, case for case.

const line = (name: string, sans: string): Opening => {
  const board = new Chess()
  const movesUci = sans.split(' ').map((san) => {
    const m = board.move(san)
    return `${m.from}${m.to}${m.promotion ?? ''}`
  })
  return { key: board.fen(), name, eco: 'C60', movesUci }
}

const OPENINGS = [
  line('Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'),
  line('Ruy Lopez: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6'),
  line('Ruy Lopez: Berlin Defense, Rio Gambit Accepted', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4'),
  line('Ruy Lopez: Morphy Defense', 'e4 e5 Nf3 Nc6 Bb5 a6'),
  line('Sicilian Defense', 'e4 c5'),
  line('Sicilian Defense: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'),
]

describe('opening families (OpeningFamiliesTests)', () => {
  const families = new OpeningFamilies(OPENINGS)

  it('are the names before the colon with their leaf lines', () => {
    expect(families.families().map((f) => [f.name, f.lines])).toEqual([
      ['Ruy Lopez', 2],
      ['Sicilian Defense', 1],
    ])
  })

  it('drill only the lines no other line extends', () => {
    expect(families.lines('Ruy Lopez').map((l) => l.name)).toEqual([
      'Ruy Lopez: Berlin Defense, Rio Gambit Accepted',
      'Ruy Lopez: Morphy Defense',
    ])
    expect(families.lines('Ruy Lopez: Berlin Defense').map((l) => l.name)).toEqual([
      'Ruy Lopez: Berlin Defense, Rio Gambit Accepted',
    ])
    expect(families.lines('Ruy Lopez: Berl')).toEqual([]) // a prefix must end at a name boundary
  })

  it('are searched by part of a name, families and variations', () => {
    expect(families.search('najdorf').map((f) => f.name)).toEqual([
      'Sicilian Defense: Najdorf Variation',
    ])
    expect(families.search('ruy').map((f) => f.name)).toEqual([
      'Ruy Lopez',
      'Ruy Lopez: Berlin Defense',
      'Ruy Lopez: Morphy Defense',
    ])
  })

  it('find a line by its key and name its family', () => {
    const najdorf = OPENINGS[5]!
    expect(families.line(najdorf.key)?.name).toBe(najdorf.name)
    expect(families.line('nope')).toBeNull()
    expect(familyName('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense')
  })

  it('leave out an opening without moves', () => {
    const empty = new OpeningFamilies([{ key: 'k', name: 'Start', eco: 'A00', movesUci: [] }])
    expect(empty.families()).toEqual([])
  })
})

describe('opening kinds (trainer-columns)', () => {
  it('reads the kind from the family name', () => {
    expect(
      [
        'Benko Gambit Accepted',
        'Blumenfeld Countergambit',
        'Alekhine Defense',
        'Old Defence',
        'London System',
        'Bird Opening',
        'Amazon Attack',
        'Ruy Lopez',
        'Italian Game',
      ].map(openingKind),
    ).toEqual([
      'gambit',
      'gambit',
      'defence',
      'defence',
      'opening',
      'opening',
      'opening',
      'game',
      'game',
    ])
  })

  it('groups in the columns’ order, learned families first, then by name', () => {
    const groups = groupFamilies([
      { name: 'French Defense', lines: 128, learned: 0 },
      { name: 'Alekhine Defense', lines: 36, learned: 0 },
      { name: 'Sicilian Defense', lines: 300, learned: 4 },
    ])
    expect(groups.map((g) => g.kind)).toEqual(['gambit', 'defence', 'opening', 'game'])
    expect(groups[1]?.families.map((f) => f.name)).toEqual([
      'Sicilian Defense',
      'Alekhine Defense',
      'French Defense',
    ])
  })
})

describe('the Leitner schedule (TrainerScheduleTests)', () => {
  const NOW = new Date('2026-10-03T10:00:00Z')
  const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)
  const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000)

  it('moves a line up one box after a clean run and spaces it out', () => {
    expect(afterRun(null, true, NOW)).toEqual({ box: 1, dueAt: days(1) })
    expect(afterRun(1, true, NOW)).toEqual({ box: 2, dueAt: days(3) })
    expect(afterRun(2, true, NOW)).toEqual({ box: 3, dueAt: days(7) })
    expect(afterRun(5, true, NOW)).toEqual({ box: 5, dueAt: days(30) })
  })

  it('sends a line back to the start after a mistake, due at once', () => {
    expect(afterRun(4, false, NOW)).toEqual({ box: 0, dueAt: NOW })
  })

  it('picks the lowest box due, then the oldest due, then a new line', () => {
    const lines = ['a', 'b', 'c', 'd']
    const progress = new Map([
      ['a', { box: 2, due: minutes(-5) }],
      ['b', { box: 0, due: minutes(-1) }],
      ['c', { box: 0, due: minutes(-9) }],
    ])
    expect(nextLine(lines, progress, NOW).line).toBe('c')
    progress.set('c', { box: 1, due: days(1) }) // trained, not due
    expect(nextLine(lines, progress, NOW).line).toBe('b')
    progress.set('b', { box: 1, due: days(1) })
    progress.set('a', { box: 3, due: days(7) })
    expect(nextLine(lines, progress, NOW).line).toBe('d') // nothing due: the first new line
  })

  it('says when the next line is when nothing is due', () => {
    const progress = new Map([
      ['a', { box: 3, due: days(7) }],
      ['b', { box: 1, due: days(1) }],
    ])
    expect(nextLine(['a', 'b'], progress, NOW)).toEqual({ line: null, nextDueAt: days(1) })
    expect(nextLine([], new Map(), NOW)).toEqual({ line: null, nextDueAt: null })
  })

  it('counts a line learned from box three', () => {
    expect([0, 1, 2, 3, 4, 5].map(isLearned)).toEqual([false, false, false, true, true, true])
  })
})

describe('study lines (StudyLinesTests)', () => {
  const M = (uci: string, ...children: Array<StudyMoveInput>): StudyMoveInput => ({ uci, children })
  const tree = (fen: string, ...moves: Array<StudyMoveInput>) => {
    const t = fromInput(fen, moves)
    if (JSON.stringify(toInput(t)) !== JSON.stringify(moves)) throw new Error('not a legal tree')
    return t
  }
  const joined = (fen: string, t: ReturnType<typeof tree>, color: 'white' | 'black') =>
    studyLines(fen, t, color).map((l) => l.moves.join(' '))

  /** 1.e4 e5 (1...c5 2.Nf3) 2.Nf3 Nc6 (2...Nf6): the Ruy main line with two replies for Black. */
  const RUY = tree(
    STANDARD_START,
    M('e2e4', M('e7e5', M('g1f3', M('b8c6'), M('g8f6'))), M('c7c5', M('g1f3'))),
  )

  it('are every path to a leaf, main line first', () => {
    expect(joined(STANDARD_START, RUY, 'white')).toEqual([
      'e2e4 e7e5 g1f3 b8c6',
      'e2e4 e7e5 g1f3 g8f6',
      'e2e4 c7c5 g1f3',
    ])
  })

  it('include alternatives for the side drilled', () => {
    const t = tree(STANDARD_START, M('e2e4', M('e7e5')), M('d2d4', M('d7d5')))
    expect(joined(STANDARD_START, t, 'white')).toEqual(['e2e4 e7e5', 'd2d4 d7d5'])
  })

  it('skip a path with no move for the side', () => {
    const t = tree(STANDARD_START, M('e2e4'), M('d2d4', M('d7d5')))
    expect(joined(STANDARD_START, t, 'black')).toEqual(['d2d4 d7d5'])
    expect(studyLines(STANDARD_START, t, 'white')).toHaveLength(2)
  })

  it('keep their keys when variations move and get new ones when their moves change', () => {
    const promoted = tree(
      STANDARD_START,
      M('e2e4', M('c7c5', M('g1f3')), M('e7e5', M('g1f3', M('g8f6'), M('b8c6')))),
    )
    const extended = tree(
      STANDARD_START,
      M('e2e4', M('e7e5', M('g1f3', M('b8c6', M('f1b5')), M('g8f6'))), M('c7c5', M('g1f3'))),
    )
    const byMoves = (t: ReturnType<typeof tree>) =>
      Object.fromEntries(
        studyLines(STANDARD_START, t, 'white').map((l) => [l.moves.join(' '), l.key]),
      )
    const before = byMoves(RUY)
    expect(byMoves(promoted)).toEqual(before)
    expect(studyLines(STANDARD_START, extended, 'white').map((l) => l.key)).not.toContain(
      before['e2e4 e7e5 g1f3 b8c6'],
    )
    for (const key of Object.values(before)) {
      expect(key.startsWith('study:')).toBe(true)
      expect(key.length).toBeLessThanOrEqual(100)
    }
  })

  it('are keyed exactly as the backend keys them', () => {
    // study: + base64url(SHA-256("{PositionKey.Of(start)} {moves}")), computed outside this code.
    expect(studyLines(STANDARD_START, RUY, 'white')[0]?.key).toBe(
      'study:tZgT6JGGpbtGMBixVnWQeyX6eGjIBdtF4oChFj6B3lg',
    )
  })

  it('from another start are other lines', () => {
    const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const lines = studyLines(AFTER_E4, tree(AFTER_E4, M('e7e5', M('g1f3'))), 'black')
    expect(lines.map((l) => l.moves)).toEqual([['e7e5', 'g1f3']])
    expect(studyLines(AFTER_E4, tree(AFTER_E4, M('e7e5')), 'white')).toEqual([])
    expect(() => studyLines('not a fen', [], 'white')).toThrow()
  })
})

describe('sha256', () => {
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  it('matches the standard digests, across block boundaries', () => {
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(hex(sha256(new TextEncoder().encode('a'.repeat(1000)))).slice(0, 16)).toBe(
      '41edece42d63e8d9',
    )
  })
})
