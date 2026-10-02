/**
 * Matchmaking, invites and "my games": the wire shapes and the pure rules Home and the invite page use.
 * Client-safe (no `lib/server` import).
 */
import { useEffect, useRef, useState } from 'react'
import { PGN_RESULT } from './games'
import type { Color, ColourChoice, EndReason, ListStatus, PgnResult } from './games'

/** `GET /api/me/games?turn=` value that keeps only the games where it is my move. */
export const MY_TURN = 'mine' as const
export type MyTurn = typeof MY_TURN

/** Mirrors `POST /api/matchmaking/{tc}`'s answer. */
export interface QueueStatus {
  status: 'waiting' | 'matched'
  timeControl: string
  position: number | null
  waiting: number | null
  gameId: string | null
  whiteId: number | null
  blackId: number | null
  /** While waiting: the queue's live seq as of this answer. Pairings in frames up to it are not yours to take. */
  seq: number | null
}

/** The `queue` live kind's payload: how many wait, and the latest pairing (D6). */
export interface QueueView {
  timeControl: string
  waitingCount: number
  lastPairing: { gameId: string; whiteId: number; blackId: number } | null
  seq: number
}

/** Mirrors the API's `InviteView`, also the `invite` live kind's payload. */
export interface InviteView {
  inviteId: string
  creatorId: number
  timeControl: string
  /** The creator's colour: white, black or random. */
  color: ColourChoice
  status: 'open' | 'accepted' | 'cancelled' | 'expired'
  gameId: string | null
  createdAt: string
  expiresAt: string
  seq: number
  /** The one user who may accept it (a rematch, game-feedback); absent or null for an ordinary invite. */
  forId?: number | null
}

/** A row of `GET /api/me/games`. */
export interface MyGameItem {
  gameId: string
  color: Color
  opponentId: number
  opponent: string
  timeControl: string
  status: ListStatus
  result: PgnResult | null
  reason: EndReason | null
  createdAt: string
  /** Being played and it is my move. */
  yourTurn?: boolean
  /** A correspondence game's deadline for the player to move. */
  deadlineAt?: string | null
}

export interface CursorPage<T> {
  items: Array<T>
  nextCursor: string | null
  limit: number
}

/** How many wait in one preset queue (live-home). */
export interface QueueCount {
  timeControl: string
  waiting: number
}

/** A Club TV game: a mini board and both names (live-home). */
export interface TvGame {
  gameId: string
  whiteId: number
  white: string
  blackId: number
  black: string
  timeControl: string
  fen: string
  lastUci: string | null
  ply: number
  updatedAt: string
}

/** `GET /api/lobby`: shared by every caller for a couple of seconds; `queues` is null when matchmaking did not answer. */
export interface Lobby {
  gamesInPlay: number
  queues: Array<QueueCount> | null
  tv: Array<TvGame>
}

/** A row of `GET /api/games?status=playing`: the Watch page's games. */
export interface LiveGameItem {
  gameId: string
  whiteId: number
  white: string
  blackId: number
  black: string
  timeControl: string
  ply: number
  updatedAt: string
  lastFen: string | null
  lastUci: string | null
}

/** The start position, for a game listed before its first move reached the read side. */
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A Watch-page row as a TV card. */
export function toTvGame(g: LiveGameItem): TvGame {
  return {
    gameId: g.gameId,
    whiteId: g.whiteId,
    white: g.white,
    blackId: g.blackId,
    black: g.black,
    timeControl: g.timeControl,
    fen: g.lastFen ?? START_FEN,
    lastUci: g.lastUci,
    ply: g.ply,
    updatedAt: g.updatedAt,
  }
}

/** "n waiting" for a preset tile, or null when the queues are unknown. */
export function waitingIn(lobby: Lobby | null, timeControl: string): number | null {
  return lobby?.queues?.find((q) => q.timeControl === timeControl)?.waiting ?? null
}

export function isQueueView(value: unknown): value is QueueView {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['timeControl'] === 'string' &&
    typeof v['waitingCount'] === 'number' &&
    typeof v['seq'] === 'number'
  )
}

export function isInviteView(value: unknown): value is InviteView {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['inviteId'] === 'string' &&
    typeof v['status'] === 'string' &&
    typeof v['seq'] === 'number'
  )
}

/**
 * The game a queue frame paired me into — only if the frame is newer than my join (`afterSeq`). The queue's view
 * keeps its last pairing, so a frame at or before my join may still name my previous game (D6).
 */
export function pairingGame(view: QueueView, meId: number, afterSeq: number): string | null {
  if (view.seq <= afterSeq) return null
  const pairing = view.lastPairing
  return pairing && (pairing.whiteId === meId || pairing.blackId === meId) ? pairing.gameId : null
}

export function outcomeFor(result: PgnResult | null, color: Color): 'win' | 'loss' | 'draw' | null {
  if (result === PGN_RESULT.draw) return 'draw'
  if (result === PGN_RESULT.whiteWins) return color === 'white' ? 'win' : 'loss'
  if (result === PGN_RESULT.blackWins) return color === 'black' ? 'win' : 'loss'
  return null
}

/** The side the person accepting an invite plays. */
export function guestColor(creatorColor: InviteView['color']): InviteView['color'] {
  if (creatorColor === 'white') return 'black'
  if (creatorColor === 'black') return 'white'
  return 'random'
}

/** How often home asks for the lobby again (live-home D1). */
export const LOBBY_POLL_MS = 10_000

/**
 * The lobby on home: the loader's answer first (null when it could not be read), then `load()` every `pollMs` while the tab is visible (live-home D1).
 * A failed poll keeps the last answer; the next one tries again.
 */
export function useLobby(
  initial: Lobby | null,
  load: () => Promise<Lobby>,
  pollMs = LOBBY_POLL_MS,
): Lobby | null {
  const [lobby, setLobby] = useState(initial)
  useEffect(() => {
    let live = true
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      load()
        .then((next) => {
          if (live) setLobby(next)
        })
        .catch(() => undefined)
    }, pollMs)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [load, pollMs])
  return lobby
}

/** A cursor-paged list on a page: what `LoadMore` drives. */
export interface Pager {
  hasMore: boolean
  busy: boolean
  error: string | null
  more: () => Promise<void>
}

/**
 * The loader's first page plus "Load more" (ui-polish): appends each next page and follows its cursor. A failed page
 * keeps the items already shown and says so; the next click tries the same cursor again.
 */
export function useLoadMore<T>(
  first: CursorPage<T>,
  fetchPage: (cursor: string) => Promise<CursorPage<T>>,
): Pager & { items: Array<T> } {
  const [items, setItems] = useState<Array<T>>(first.items)
  const [cursor, setCursor] = useState(first.nextCursor)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function more() {
    if (!cursor || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const page = await fetchPage(cursor)
      setItems((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } catch {
      setError('The next page could not be loaded. Try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { items, hasMore: cursor !== null, busy, error, more }
}
