/**
 * Matchmaking, rematch invites and "my games": the wire shapes and the pure rules Home and the game page use.
 * Client-safe (no `lib/server` import).
 */
import { useEffect, useRef, useState } from 'react'
import { PGN_RESULT } from './games'
import type { Pager } from '@chess/ui'
import type { Color, EndReason, ListStatus, PgnResult } from './games'
import type { ColourChoice } from '@chess/core'

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

/**
 * Mirrors the API's `InviteView` (a rematch offer, game-feedback; a challenge, club-members), also the `invite` live
 * kind's payload.
 */
export interface InviteView {
  inviteId: string
  creatorId: number
  timeControl: string
  /** The creator's colour: white, black or random. */
  color: ColourChoice
  status: 'open' | 'accepted' | 'cancelled' | 'expired' | 'declined'
  /** Absent in frames from before challenges: a rematch. */
  kind?: 'rematch' | 'challenge'
  gameId: string | null
  createdAt: string
  expiresAt: string
  seq: number
  /** The one user who may accept it (the other player); absent or null only in invites from before rematches. */
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

/** `GET /api/lobby`: shared by every caller for a couple of seconds; `queues` is null when matchmaking did not answer. */
export interface Lobby {
  gamesInPlay: number
  queues: Array<QueueCount> | null
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
