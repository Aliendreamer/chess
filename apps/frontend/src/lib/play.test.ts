import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  guestColor,
  isInviteView,
  isQueueView,
  outcomeFor,
  pairingGame,
  toTvGame,
  useLoadMore,
  useLobby,
  waitingIn,
} from './play'
import type { InviteView, Lobby, QueueView } from './play'

const GAME = '0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f'

const queue: QueueView = {
  timeControl: '5+3',
  waitingCount: 0,
  lastPairing: { gameId: GAME, whiteId: 4, blackId: 5 },
  seq: 7,
}

const invite: InviteView = {
  inviteId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  creatorId: 4,
  timeControl: '10+5',
  color: 'black',
  status: 'open',
  gameId: null,
  createdAt: '2026-09-26T10:00:00+00:00',
  expiresAt: '2026-09-27T10:00:00+00:00',
  seq: 1,
}

describe('pairingGame', () => {
  it('is the game when a frame newer than my join names me, either colour', () => {
    expect(pairingGame(queue, 4, 6)).toBe(GAME)
    expect(pairingGame(queue, 5, 6)).toBe(GAME)
  })

  it('ignores a pairing at or before my join: it is my previous game', () => {
    expect(pairingGame(queue, 4, 7)).toBeNull()
    expect(pairingGame(queue, 4, 9)).toBeNull()
  })

  it('is null for someone else, or no pairing yet', () => {
    expect(pairingGame(queue, 9, 0)).toBeNull()
    expect(pairingGame({ ...queue, lastPairing: null }, 4, 0)).toBeNull()
  })
})

describe('outcomeFor', () => {
  it.each([
    ['1-0', 'white', 'win'],
    ['1-0', 'black', 'loss'],
    ['0-1', 'black', 'win'],
    ['1/2-1/2', 'white', 'draw'],
    ['*', 'white', null],
    [null, 'white', null],
  ] as const)('%s as %s is %s', (result, color, outcome) => {
    expect(outcomeFor(result, color)).toBe(outcome)
  })
})

describe('guestColor', () => {
  it('is the other side, or random', () => {
    expect(guestColor('white')).toBe('black')
    expect(guestColor('black')).toBe('white')
    expect(guestColor('random')).toBe('random')
  })
})

describe('guards', () => {
  it('recognise queue and invite payloads', () => {
    expect(isQueueView(queue)).toBe(true)
    expect(isQueueView(invite)).toBe(false)
    expect(isInviteView(invite)).toBe(true)
    expect(isInviteView(queue)).toBe(false)
    expect(isInviteView(null)).toBe(false)
  })
})

describe('waitingIn', () => {
  const lobby: Lobby = {
    gamesInPlay: 1,
    queues: [
      { timeControl: '3+2', waiting: 1 },
      { timeControl: '5+0', waiting: 0 },
    ],
    tv: [],
  }

  it('reads one queue, and knows nothing without the queues', () => {
    expect(waitingIn(lobby, '3+2')).toBe(1)
    expect(waitingIn(lobby, '5+0')).toBe(0)
    expect(waitingIn({ ...lobby, queues: null }, '3+2')).toBeNull()
    expect(waitingIn(null, '3+2')).toBeNull()
  })
})

describe('useLobby', () => {
  const first: Lobby = { gamesInPlay: 1, queues: null, tv: [] }
  const second: Lobby = { gamesInPlay: 2, queues: null, tv: [] }

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('starts from the loader data and asks again every poll while visible', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => Promise.resolve(second))
    const { result } = renderHook(() => useLobby(first, load, 10_000))
    expect(result.current?.gamesInPlay).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current?.gamesInPlay).toBe(2)
  })

  it('skips a poll while the tab is hidden and keeps the last answer when one fails', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => Promise.reject(new Error('down')))
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { result } = renderHook(() => useLobby(first, load, 10_000))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(load).not.toHaveBeenCalled()

    hidden.mockReturnValue('visible')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(first)
    hidden.mockRestore()
  })
})

describe('toTvGame', () => {
  it('draws a game from the read side, the start position before its first move', () => {
    const row = {
      gameId: GAME,
      whiteId: 1,
      white: 'testuser',
      blackId: 2,
      black: 'player',
      timeControl: '3+2',
      ply: 0,
      updatedAt: '2026-10-02T10:00:00Z',
      lastFen: null,
      lastUci: null,
    }
    expect(toTvGame(row).fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(
      toTvGame({ ...row, lastFen: '8/8/8/8/8/8/8/8 w - - 0 1', lastUci: 'e2e4' }),
    ).toMatchObject({
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      lastUci: 'e2e4',
      white: 'testuser',
    })
  })
})

describe('useLoadMore', () => {
  afterEach(cleanup)
  const first = { items: [1, 2], nextCursor: 'c1', limit: 2 }

  it('appends the next page and follows its cursor to the end', async () => {
    const fetchPage = vi.fn((cursor: string) =>
      Promise.resolve(
        cursor === 'c1'
          ? { items: [3, 4], nextCursor: 'c2', limit: 2 }
          : { items: [5], nextCursor: null, limit: 2 },
      ),
    )
    const { result } = renderHook(() => useLoadMore(first, fetchPage))
    await act(() => result.current.more())
    expect(result.current.items).toEqual([1, 2, 3, 4])
    await act(() => result.current.more())
    expect(result.current.items).toEqual([1, 2, 3, 4, 5])
    expect(result.current.hasMore).toBe(false)
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2'])
  })

  it('keeps what it has and says so when a page fails', async () => {
    const { result } = renderHook(() => useLoadMore(first, () => Promise.reject(new Error('503'))))
    await act(() => result.current.more())
    expect(result.current.items).toEqual([1, 2])
    expect(result.current.error).toBe('The next page could not be loaded. Try again.')
    expect(result.current.busy).toBe(false)
    expect(result.current.hasMore).toBe(true)
  })
})
