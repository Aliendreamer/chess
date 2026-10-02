import { describe, expect, it } from 'vitest'
import {
  STANDARD_START,
  addMove,
  childrenAt,
  fenAt,
  lineEnd,
  moveNumber,
  nextPath,
  nodeAt,
  parsePgn,
  playMove,
  promote,
  remove,
  studyByline,
  toInput,
} from './studies'
import type { StudyMove } from './studies'

const m = (uci: string, san: string, children: Array<StudyMove> = []): StudyMove => ({
  uci,
  san,
  fen: `fen-${san}`,
  children,
})

/** 1.e4 e5 (1…c5) 2.Nf3 */
const tree: Array<StudyMove> = [
  m('e2e4', 'e4', [m('e7e5', 'e5', [m('g1f3', 'Nf3')]), m('c7c5', 'c5')]),
]

describe('the move tree', () => {
  it('walks paths, lines and positions', () => {
    expect(nodeAt(tree, [0, 1])?.san).toBe('c5')
    expect(nodeAt(tree, [0, 5])).toBeNull()
    expect(childrenAt(tree, []).map((c) => c.san)).toEqual(['e4'])
    expect(fenAt(STANDARD_START, tree, [])).toBe(STANDARD_START)
    expect(fenAt(STANDARD_START, tree, [0, 0])).toBe('fen-e5')
    expect(nextPath(tree, [0])).toEqual([0, 0])
    expect(nextPath(tree, [0, 1])).toBeNull()
    expect(lineEnd(tree, [])).toEqual([0, 0, 0])
  })

  it('follows an existing move, or adds a new line after the others', () => {
    const same = addMove(tree, [0], m('c7c5', 'c5'))
    expect(same.path).toEqual([0, 1])
    expect(childrenAt(same.tree, [0])).toHaveLength(2)

    const added = addMove(tree, [0], m('d7d6', 'd6'))
    expect(added.path).toEqual([0, 2])
    expect(childrenAt(added.tree, [0]).map((c) => c.san)).toEqual(['e5', 'c5', 'd6'])
    expect(childrenAt(tree, [0])).toHaveLength(2) // the original is untouched
  })

  it('promotes a variation and removes a line with what follows', () => {
    expect(childrenAt(promote(tree, [0, 1]), [0]).map((c) => c.san)).toEqual(['c5', 'e5'])
    expect(childrenAt(remove(tree, [0, 0]), [0]).map((c) => c.san)).toEqual(['c5'])
    expect(remove(tree, [0])).toEqual([])
  })

  it('is sent as UCI only', () => {
    expect(toInput(tree)).toEqual([
      {
        uci: 'e2e4',
        children: [
          { uci: 'e7e5', children: [{ uci: 'g1f3', children: [] }] },
          { uci: 'c7c5', children: [] },
        ],
      },
    ])
  })
})

describe('parsePgn', () => {
  const pgn = [
    '[Event "Ruy ideas"]\n[White "ann"]\n[Black "bob"]\n[Result "1-0"]\n[Date "2026.09.28"]\n\n1. e4 e5 (1... c5 2. Nf3) 2. Nf3 {main} Nc6 (2... d6) 1-0',
    '[Event "?"]\n[White "cat"]\n[Black "dan"]\n\n1. e4 e5 2. Ke3 *',
    '[Event "Endgame"]\n[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 40"]\n\n40. e4 Kxe4 *',
  ].join('\n\n')

  it('makes one study per game, with variations as siblings, and reports a broken game', () => {
    const [ruy, broken, endgame] = parsePgn(pgn)

    expect(ruy).toEqual({
      ok: true,
      study: {
        title: 'Ruy ideas',
        startFen: STANDARD_START,
        white: 'ann',
        black: 'bob',
        result: '1-0',
        date: '2026.09.28',
        tree: [
          {
            uci: 'e2e4',
            children: [
              {
                uci: 'e7e5',
                children: [
                  {
                    uci: 'g1f3',
                    children: [
                      { uci: 'b8c6', children: [] },
                      { uci: 'd7d6', children: [] },
                    ],
                  },
                ],
              },
              { uci: 'c7c5', children: [{ uci: 'g1f3', children: [] }] },
            ],
          },
        ],
      },
    })
    expect(broken).toMatchObject({ ok: false })
    expect(broken?.ok === false && broken.error).toMatch(/^Game 2: /)
    expect(endgame).toMatchObject({
      ok: true,
      study: { title: 'Endgame', startFen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 40' },
    })
  })

  it('names an untitled game by its players', () => {
    const [game] = parsePgn('[White "cat"]\n[Black "dan"]\n\n1. d4 *')

    expect(game).toMatchObject({ ok: true, study: { title: 'cat – dan' } })
  })
})

describe('playing on the study board', () => {
  it('gives the move its SAN and the position after it, or nothing when illegal', () => {
    expect(playMove(STANDARD_START, 'e2e4')).toEqual({
      uci: 'e2e4',
      san: 'e4',
      // chess.js writes the en-passant square only when a capture is possible; the server's FEN replaces it on save.
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      children: [],
    })
    expect(playMove(STANDARD_START, 'e2e5')).toBeNull()
    expect(playMove('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8n')?.san).toBe('a8=N')
  })

  it('numbers White always and Black only where a line starts', () => {
    expect(moveNumber(STANDARD_START, false)).toBe('1.')
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    expect(moveNumber(afterE4, true)).toBe('1...')
    expect(moveNumber(afterE4, false)).toBeNull()
  })
})

describe('studyByline (ui-polish)', () => {
  const study = { white: 'Anna', black: 'Bob', result: '1-0', ownerName: 'testuser' }

  it('names the players, the result and, for others, the owner', () => {
    expect(studyByline(study, true)).toBe('Anna – Bob · 1-0')
    expect(studyByline(study, false)).toBe('Anna – Bob · 1-0 · by testuser · read-only')
  })

  it('leaves out an unknown result and missing players', () => {
    expect(studyByline({ ...study, result: '*' }, true)).toBe('Anna – Bob')
    expect(studyByline({ white: null, black: null, result: null, ownerName: 'x' }, true)).toBe('')
  })
})
