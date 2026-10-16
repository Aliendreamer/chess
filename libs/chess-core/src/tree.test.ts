import { describe, expect, it } from 'vitest'
import {
  STANDARD_START,
  addMove,
  childrenAt,
  fenAt,
  fromGame,
  fromInput,
  isFen,
  lineEnd,
  moveNumber,
  nextPath,
  nodeAt,
  parsePgn,
  playMove,
  promote,
  remove,
  studyPgn,
  toInput,
} from './tree.ts'
import type { StudyMove, StudyMoveInput } from './tree.ts'

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

    expect(ruy).toMatchObject({
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

describe('starting points (analysis-board)', () => {
  it('knows a legal FEN from anything else', () => {
    expect(isFen(STANDARD_START)).toBe(true)
    expect(isFen('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(false) // no kings
    expect(isFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq')).toBe(false)
    expect(isFen('hello')).toBe(false)
  })

  it('turns a game into its main line', () => {
    const e4 = playMove(STANDARD_START, 'e2e4')!
    const e5 = playMove(e4.fen, 'e7e5')!
    const line = fromGame([
      { uci: 'e2e4', san: 'e4', fenAfter: e4.fen },
      { uci: 'e7e5', san: 'e5', fenAfter: e5.fen },
    ])
    expect(line).toEqual([
      {
        uci: 'e2e4',
        san: 'e4',
        fen: e4.fen,
        children: [{ uci: 'e7e5', san: 'e5', fen: e5.fen, children: [] }],
      },
    ])
    expect(fromGame([])).toEqual([])
  })
})

describe('fromInput (analysis-board)', () => {
  it('replays UCI moves with their variations into a full tree, stopping at an illegal move', () => {
    const replayed = fromInput(STANDARD_START, [
      {
        uci: 'e2e4',
        children: [
          { uci: 'e7e5', children: [] },
          { uci: 'c7c5', children: [] },
        ],
      },
    ])
    expect(replayed[0]?.san).toBe('e4')
    expect(replayed[0]?.children.map((move) => move.san)).toEqual(['e5', 'c5'])
    expect(fromInput(STANDARD_START, [{ uci: 'e2e5', children: [] }])).toEqual([])
  })
})

describe('parsePgn headers (game-library)', () => {
  it('passes the factual headers through, keeping a partial date', () => {
    const [game] = parsePgn(
      '[Event "World Championship"]\n[Site "New York"]\n[Date "1886.??.??"]\n[Round "1"]\n[White "Zukertort"]\n[Black "Steinitz"]\n[Result "1-0"]\n[ECO "D26"]\n\n1. d4 d5 1-0',
    )
    expect(game?.ok && game.headers).toEqual({
      event: 'World Championship',
      site: 'New York',
      round: '1',
      date: '1886.??.??',
      eco: 'D26',
    })
  })

  it('leaves out unknown headers', () => {
    const [game] = parsePgn('[Event "?"]\n[Date "????.??.??"]\n\n1. e4 *')
    expect(game?.ok && game.headers).toEqual({
      event: null,
      site: null,
      round: null,
      date: null,
      eco: null,
    })
  })
})

describe('parsePgn tolerance (game-library)', () => {
  it('reads games whose movetext follows the headers without a blank line, with Windows line ends', () => {
    const pgn = [
      '[Event "WCh 2018"]\r\n[White "Caruana, Fabiano"]\r\n[Black "Carlsen, Magnus"]\r\n[Result "1/2-1/2"]\r\n1. e4 c5 1/2-1/2',
      '[Event "WCh 2018"]\r\n[White "Carlsen, Magnus"]\r\n[Black "Caruana, Fabiano"]\r\n[Result "1/2-1/2"]\r\n1. d4 d5 1/2-1/2',
    ].join('\r\n') // and the next game's headers right after the result, no blank line either
    const games = parsePgn(pgn)
    expect(games.map((g) => g.ok)).toEqual([true, true])
    expect(games.map((g) => (g.ok ? g.study.white : null))).toEqual([
      'Caruana, Fabiano',
      'Carlsen, Magnus',
    ])
  })
})

describe('a study as PGN (StudyPgnTests)', () => {
  const M = (uci: string, ...children: Array<StudyMoveInput>): StudyMoveInput => ({ uci, children })

  it('puts variations after the move they replace and numbers Black’s moves after them', () => {
    const study = fromInput(STANDARD_START, [
      M('e2e4', M('e7e5', M('g1f3', M('b8c6'), M('d7d6'))), M('c7c5', M('g1f3'))),
    ])
    expect(
      studyPgn(
        'Ruy ideas',
        { white: 'ann', black: 'bob', result: '1-0', date: '2026.09.28' },
        STANDARD_START,
        study,
      ),
    ).toBe(
      '[Event "Ruy ideas"]\n[Site "chess"]\n[Date "2026.09.28"]\n[Round "-"]\n[White "ann"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6) 1-0\n',
    )
  })

  it('writes SetUp and FEN for a custom start, and unknowns as PGN does', () => {
    const start = '8/8/8/4k3/8/8/4P3/4K3 b - - 0 40'
    const pgn = studyPgn('Endgame "lesson"', {}, start, fromInput(start, [M('e5e4')]))
    expect(pgn).toContain('[Event "Endgame \\"lesson\\""]')
    expect(pgn).toContain(
      '[White "?"]\n[Black "?"]\n[Result "*"]\n[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 b - - 0 40"]',
    )
    expect(pgn.endsWith('\n40... Ke4 *\n')).toBe(true)
  })
})
