import { useEffect, useState } from 'react'
import { category } from '@chess/core'
import { ageText } from '@chess/ui'
import type { ColourChoice } from '@chess/core'
import type { InviteView } from './play'

/**
 * Club members (club-members, challenges): who is in the club and online, the challenges to me, and where my own
 * challenge stands. Client-safe and pure, except the `useNow` clock; the reads are in `lib/server/members.ts`.
 */

export const MEMBER_STATES = ['online', 'playing', 'offline'] as const
export type MemberState = (typeof MEMBER_STATES)[number]

/** A row of `GET /api/members`. */
export interface Member {
  id: number
  username: string
  state: MemberState
  lastSeenAt: string | null
}

/** `GET /api/members`; also the `members` live kind's payload (with its `seq`). `presenceKnown` false: all offline. */
export interface MembersView {
  items: Array<Member>
  presenceKnown: boolean
  seq?: number
}

/** An open challenge to me, as the `user:{me}` topic lists it. `color` is the challenger's. */
export interface Challenge {
  inviteId: string
  fromId: number
  from: string
  timeControl: string
  color: ColourChoice
  expiresAt: string
}

/** The `user` live kind's payload: the open challenges to that member. */
export interface UserView {
  userId: number
  seq: number
  challenges: Array<Challenge>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function isMember(value: unknown): value is Member {
  return (
    isObject(value) &&
    typeof value['id'] === 'number' &&
    typeof value['username'] === 'string' &&
    (MEMBER_STATES as ReadonlyArray<unknown>).includes(value['state'])
  )
}

function isChallenge(value: unknown): value is Challenge {
  return (
    isObject(value) &&
    typeof value['inviteId'] === 'string' &&
    typeof value['from'] === 'string' &&
    typeof value['timeControl'] === 'string' &&
    typeof value['expiresAt'] === 'string'
  )
}

export function isMembersView(value: unknown): value is MembersView {
  return (
    isObject(value) &&
    typeof value['presenceKnown'] === 'boolean' &&
    Array.isArray(value['items']) &&
    value['items'].every(isMember)
  )
}

export function isUserView(value: unknown): value is UserView {
  return (
    isObject(value) &&
    typeof value['userId'] === 'number' &&
    typeof value['seq'] === 'number' &&
    Array.isArray(value['challenges']) &&
    value['challenges'].every(isChallenge)
  )
}

const STATE_ORDER: Record<MemberState, number> = { online: 0, playing: 1, offline: 2 }

/** Online first, then playing, then offline; by name within each. */
export function sortMembers(members: ReadonlyArray<Member>): Array<Member> {
  return [...members].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.username.localeCompare(b.username, 'en', { sensitivity: 'base' }),
  )
}

const STATE_TEXT: Record<MemberState, string> = {
  online: 'Online',
  playing: 'Playing',
  offline: 'Offline',
}

export function stateText(state: MemberState): string {
  return STATE_TEXT[state]
}

/** "last seen 3 h ago"; "not seen yet" for a member who never signed in. */
export function lastSeenText(lastSeenAt: string | null, nowMs: number): string {
  return lastSeenAt ? `last seen ${ageText(lastSeenAt, nowMs)}` : 'not seen yet'
}

/** A member I may challenge: online and not playing, not me, and presence is known. */
export function canChallenge(member: Member, meId: number, presenceKnown: boolean): boolean {
  return presenceKnown && member.state === 'online' && member.id !== meId
}

/** Whole seconds until `expiresAt` on the client's clock, never below 0. */
export function secondsLeft(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000))
}

/** A countdown as "0:42". */
export function countdownText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Blitz 5+3". */
export function gameTypeText(timeControl: string): string {
  return `${category(timeControl)} ${timeControl}`
}

const OPPOSITE: Record<ColourChoice, string> = {
  white: 'black',
  black: 'white',
  random: 'a random colour',
}

/** What the challenged member plays: the other colour than the challenger's. */
export function myColourText(challengerColor: ColourChoice): string {
  return OPPOSITE[challengerColor]
}

/** The banner's line: "alice challenges you to Blitz 5+3, you play black". */
export function challengeText(challenge: Challenge): string {
  return `${challenge.from} challenges you to ${gameTypeText(challenge.timeControl)}, you play ${myColourText(challenge.color)}`
}

/** The challenges still worth showing: not expired on this clock, not answered here. */
export function openChallenges(
  view: UserView | undefined,
  nowMs: number,
  answered: ReadonlySet<string> = new Set(),
): Array<Challenge> {
  return (view?.challenges ?? []).filter(
    (c) => !answered.has(c.inviteId) && secondsLeft(c.expiresAt, nowMs) > 0,
  )
}

/** Where my challenge stands, from its `invite:{id}` view. */
export type ChallengeState =
  | { kind: 'waiting'; expiresAt: string }
  | { kind: 'started'; gameId: string }
  | { kind: 'declined' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }

export function challengeState(invite: InviteView, nowMs: number): ChallengeState {
  if (invite.status === 'accepted' && invite.gameId)
    return { kind: 'started', gameId: invite.gameId }
  if (invite.status === 'declined') return { kind: 'declined' }
  if (invite.status === 'cancelled') return { kind: 'cancelled' }
  if (invite.status === 'expired' || secondsLeft(invite.expiresAt, nowMs) === 0)
    return { kind: 'expired' }
  return { kind: 'waiting', expiresAt: invite.expiresAt }
}

/** The client's clock, ticking every `everyMs` while `running` (countdowns, "last seen"). */
export function useNow(everyMs = 1000, running = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs, running])
  return now
}
