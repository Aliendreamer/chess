/**
 * Matchmaking, invites and "my games": the wire shapes and the pure rules Home and the invite page use.
 * Client-safe (no `lib/server` import).
 */
import type { Color } from './games'

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
  color: 'white' | 'black' | 'random'
  status: 'open' | 'accepted' | 'cancelled' | 'expired'
  gameId: string | null
  createdAt: string
  expiresAt: string
  seq: number
}

/** A row of `GET /api/me/games`. */
export interface MyGameItem {
  gameId: string
  color: Color
  opponentId: number
  opponent: string
  timeControl: string
  status: string
  result: string | null
  reason: string | null
  createdAt: string
}

export interface CursorPage<T> {
  items: Array<T>
  nextCursor: string | null
  limit: number
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

export function outcomeFor(result: string | null, color: Color): 'win' | 'loss' | 'draw' | null {
  if (result === '1/2-1/2') return 'draw'
  if (result === '1-0') return color === 'white' ? 'win' : 'loss'
  if (result === '0-1') return color === 'black' ? 'win' : 'loss'
  return null
}

/** The side the person accepting an invite plays. */
export function guestColor(creatorColor: InviteView['color']): InviteView['color'] {
  if (creatorColor === 'white') return 'black'
  if (creatorColor === 'black') return 'white'
  return 'random'
}
