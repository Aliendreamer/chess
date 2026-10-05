import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROADCAST_POSITION_MOVES,
  batches,
  creditsFor,
  isLibrarySource,
  mainLine,
  publishedMonths,
  searchQuery,
  toImportGame,
  uciLine,
  useBroadcastRuns,
  useLibraryPosition,
  useOpeningName,
} from './library'
import { parsePgn } from './studies'
import type { BroadcastRun } from './library'

describe('searchQuery', () => {
  it('sends only the filters that are set', () => {
    expect(searchQuery({ player: 'kasparov', from: 1984, to: 1990, wc: true }, 20)).toBe(
      'limit=20&player=kasparov&from=1984&to=1990&wc=true',
    )
    expect(searchQuery({ player: '  ', eco: 'C67' }, 20, 'abc')).toBe('limit=20&eco=C67&cursor=abc')
  })

  it('sends a source other than all', () => {
    expect(searchQuery({ player: 'carlsen', source: 'broadcasts' }, 20)).toBe(
      'limit=20&player=carlsen&source=broadcasts',
    )
    expect(searchQuery({ source: 'all' }, 20)).toBe('limit=20')
  })
})

describe('sources', () => {
  it('knows the three choices', () => {
    expect(['all', 'wc', 'broadcasts', 'lichess', undefined].map(isLibrarySource)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })

  it('credits every source counted, lichess broadcasts with their licence and a link', () => {
    expect(creditsFor('broadcasts')).toEqual([
      {
        label: 'Lichess broadcasts, CC BY-SA 4.0',
        href: 'https://database.lichess.org/#broadcasts',
      },
    ])
    expect(creditsFor('all').map((c) => c.label)).toEqual([
      'World Championships from PGN Mentor',
      'Lichess broadcasts, CC BY-SA 4.0',
    ])
    expect(creditsFor('wc')).toHaveLength(1)
    expect(BROADCAST_POSITION_MOVES).toBe(20)
  })

  it('lists the published months, newest first, up to last month', () => {
    const months = publishedMonths(new Date('2026-10-05T12:00:00Z'))
    expect(months[0]).toBe('2026-09')
    expect(months.at(-1)).toBe('2020-01')
    expect(months).toHaveLength(81)
    expect(publishedMonths(new Date('2026-01-15T00:00:00Z'))[0]).toBe('2025-12')
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

describe('uciLine', () => {
  it("turns a game's moves into a one-line tree", () => {
    expect(uciLine(['e2e4', 'e7e5'])).toEqual([
      { uci: 'e2e4', children: [{ uci: 'e7e5', children: [] }] },
    ])
  })
})

describe('useOpeningName', () => {
  afterEach(cleanup)

  it('names the position by the deepest named one along the line, asking each position once', async () => {
    const named: Record<string, { eco: string; name: string } | null> = {
      k1: { eco: 'C20', name: "King's Pawn Game" },
      k2: { eco: 'C30', name: "King's Gambit" },
      k3: null,
    }
    const load = vi.fn((key: string) => Promise.resolve(named[key] ?? null))
    const { result, rerender } = renderHook(({ keys }) => useOpeningName(keys, load), {
      initialProps: { keys: ['k1', 'k2', 'k3'] },
    })
    await waitFor(() => expect(result.current?.name).toBe("King's Gambit"))
    expect(load.mock.calls.map((c) => c[0])).toEqual(['k3', 'k2'])

    rerender({ keys: ['k1'] })
    await waitFor(() => expect(result.current?.name).toBe("King's Pawn Game"))
    rerender({ keys: [] })
    await waitFor(() => expect(result.current).toBeNull())
  })
})

describe('useLibraryPosition', () => {
  afterEach(cleanup)

  it('asks for the position on the board and keeps the answer per position', async () => {
    const answer = { games: 1, whiteWins: 1, draws: 0, blackWins: 0, items: [], moves: [] }
    const load = vi.fn(() => Promise.resolve(answer))
    const { result, rerender } = renderHook(
      ({ key, source }: { key: string; source: 'all' | 'broadcasts' }) =>
        useLibraryPosition(key, source, load),
      { initialProps: { key: 'k1', source: 'all' } },
    )
    await waitFor(() => expect(result.current).toEqual(answer))
    rerender({ key: 'k2', source: 'all' })
    rerender({ key: 'k1', source: 'all' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    rerender({ key: 'k1', source: 'broadcasts' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3))
    expect(load).toHaveBeenLastCalledWith('k1', 'broadcasts')
  })
})

describe('useBroadcastRuns', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const run = (state: BroadcastRun['state'], imported = 0): BroadcastRun => ({
    id: 'r1',
    month: '2026-08',
    state,
    read: 0,
    kept: 0,
    imported,
    duplicate: 0,
    refused: 0,
    error: null,
    startedAt: '2026-10-05T10:00:00Z',
    finishedAt: null,
  })

  it('polls while a run is running and stops once none is', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn<() => Promise<Array<BroadcastRun>>>()
      .mockResolvedValueOnce([run('running', 500)])
      .mockResolvedValue([run('finished', 900)])
    const { result } = renderHook(() => useBroadcastRuns([run('running')], load, 2000))
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(result.current.runs[0]?.imported).toBe(500)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(result.current.runs[0]?.state).toBe('finished')
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not poll when nothing runs, and refreshes on demand', async () => {
    vi.useFakeTimers()
    const load = vi.fn<() => Promise<Array<BroadcastRun>>>().mockResolvedValue([run('running')])
    const { result } = renderHook(() => useBroadcastRuns([], load, 2000))
    await act(() => vi.advanceTimersByTimeAsync(6000))
    expect(load).not.toHaveBeenCalled()
    await act(() => result.current.refresh())
    expect(result.current.runs).toHaveLength(1)
  })
})
