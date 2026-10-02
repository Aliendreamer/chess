import { describe, expect, it } from 'vitest'
import { batches, mainLine, searchQuery, toImportGame } from './library'
import { parsePgn } from './studies'

describe('searchQuery', () => {
  it('sends only the filters that are set', () => {
    expect(searchQuery({ player: 'kasparov', from: 1984, to: 1990, wc: true }, 20)).toBe(
      'limit=20&player=kasparov&from=1984&to=1990&wc=true',
    )
    expect(searchQuery({ player: '  ', eco: 'C67' }, 20, 'abc')).toBe('limit=20&eco=C67&cursor=abc')
  })
})

describe('toImportGame', () => {
  it('turns a parsed PGN game into the import shape: headers and the main line only', () => {
    const [parsed] = parsePgn(
      '[Event "Immortal"]\n[Date "1851.??.??"]\n[White "Anderssen"]\n[Black "Kieseritzky"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5) 2. f4 1-0',
    )
    expect(parsed?.ok && toImportGame(parsed)).toEqual({
      white: 'Anderssen',
      black: 'Kieseritzky',
      event: 'Immortal',
      site: null,
      round: null,
      date: '1851.??.??',
      result: '1-0',
      eco: null,
      moves: ['e2e4', 'e7e5', 'f2f4'],
      startFen: null,
    })
  })

  it('keeps a FEN start so the server can refuse it, and an unknown result as *', () => {
    const [parsed] = parsePgn('[FEN "8/8/8/8/8/8/k7/4K2R w K - 0 1"]\n[SetUp "1"]\n\n1. Rh2 *')
    const game = parsed?.ok ? toImportGame(parsed) : null
    expect(game?.startFen).toBe('8/8/8/8/8/8/k7/4K2R w K - 0 1')
    expect(game?.result).toBe('*')
    expect(game?.white).toBe('?')
  })
})

describe('mainLine and batches', () => {
  it('follows first children', () => {
    expect(
      mainLine([
        {
          uci: 'a',
          children: [
            { uci: 'b', children: [] },
            { uci: 'x', children: [] },
          ],
        },
      ]),
    ).toEqual(['a', 'b'])
  })

  it('cuts a list into batches', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(batches([], 100)).toEqual([])
  })
})
