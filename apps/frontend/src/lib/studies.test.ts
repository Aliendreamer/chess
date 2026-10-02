import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  STANDARD_START,
  addMove,
  analysisTitle,
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
  studyByline,
  toInput,
  useMoveTree,
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

describe('useMoveTree (analysis-board)', () => {
  afterEach(cleanup)
  const PROMOTE = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'

  it('plays a dragged move into the tree and follows it', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    let ok = false
    act(() => {
      ok = result.current.onDrop('e2', 'e4')
    })
    expect(ok).toBe(true)
    expect(result.current.tree.map((move) => move.san)).toEqual(['e4'])
    expect(result.current.path).toEqual([0])
    expect(result.current.fen.split(' ')[1]).toBe('b')
  })

  it('refuses an illegal drop and asks before a promotion', () => {
    const { result } = renderHook(() => useMoveTree(PROMOTE, []))
    act(() => {
      expect(result.current.onDrop('e1', 'e3')).toBe(false)
    })
    expect(result.current.tree).toEqual([])
    act(() => {
      result.current.onDrop('e7', 'e8')
    })
    expect(result.current.promotion).toEqual({ from: 'e7', to: 'e8' })
    act(() => result.current.pickPromotion('q'))
    expect(result.current.tree[0]?.san).toBe('e8=Q')
    expect(result.current.promotion).toBeNull()
  })

  it('walks the line with the keyboard and flips with f', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    act(() => {
      result.current.onDrop('e2', 'e4')
    })
    act(() => {
      result.current.onDrop('e7', 'e5')
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })
    expect(result.current.path).toEqual([0])
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))
    })
    expect(result.current.orientation).toBe('black')
  })

  it('plays an engine line and can start again from another position', () => {
    const { result } = renderHook(() => useMoveTree(STANDARD_START, []))
    const e4 = playMove(STANDARD_START, 'e2e4')!
    act(() => result.current.playLine([e4, playMove(e4.fen, 'e7e5')!]))
    expect(result.current.tree.map((move) => move.san)).toEqual(['e4'])
    expect(result.current.path).toEqual([0, 0])
    act(() => result.current.reset(PROMOTE, []))
    expect(result.current.fen).toBe(PROMOTE)
    expect(result.current.path).toEqual([])
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

  it('names the study an analysis is saved as', () => {
    expect(analysisTitle()).toBe('Analysis')
    expect(analysisTitle({ white: 'Kasparov', black: 'Karpov' })).toBe(
      'Kasparov vs Karpov, analysis',
    )
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
