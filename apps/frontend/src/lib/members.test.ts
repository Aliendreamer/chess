import { describe, expect, it } from 'vitest'
import {
  canChallenge,
  challengeState,
  challengeText,
  countdownText,
  isMembersView,
  isUserView,
  lastSeenText,
  openChallenges,
  secondsLeft,
  sortMembers,
} from './members'
import type { Challenge, Member } from './members'
import type { InviteView } from './play'

const NOW = Date.parse('2026-10-13T12:00:00Z')

const member = (id: number, username: string, state: Member['state']): Member => ({
  id,
  username,
  state,
  lastSeenAt: null,
})

const challenge = (inviteId: string, expiresAt: string): Challenge => ({
  inviteId,
  fromId: 8,
  from: 'alice',
  timeControl: '5+3',
  color: 'white',
  expiresAt,
})

const invite = (over: Partial<InviteView>): InviteView => ({
  inviteId: 'i1',
  creatorId: 7,
  timeControl: '3+2',
  color: 'random',
  status: 'open',
  kind: 'challenge',
  gameId: null,
  createdAt: '2026-10-13T11:59:30Z',
  expiresAt: '2026-10-13T12:00:30Z',
  seq: 1,
  forId: 8,
  ...over,
})

describe('guards', () => {
  it('accept the members and user payloads', () => {
    expect(isMembersView({ items: [member(1, 'a', 'online')], presenceKnown: true, seq: 3 })).toBe(
      true,
    )
    expect(
      isMembersView({ items: [{ id: 1, username: 'a', state: 'away' }], presenceKnown: true }),
    ).toBe(false)
    expect(isMembersView({ items: [] })).toBe(false)
    expect(
      isUserView({ userId: 7, seq: 2, challenges: [challenge('i1', '2026-10-13T12:01:00Z')] }),
    ).toBe(true)
    expect(isUserView({ userId: 7, challenges: [] })).toBe(false)
    expect(isUserView(null)).toBe(false)
  })
})

describe('sortMembers', () => {
  it('puts online first, then playing, then offline, by name within each', () => {
    const sorted = sortMembers([
      member(1, 'zed', 'offline'),
      member(2, 'Bob', 'online'),
      member(3, 'carol', 'playing'),
      member(4, 'alice', 'online'),
      member(5, 'dave', 'offline'),
    ])
    expect(sorted.map((m) => m.username)).toEqual(['alice', 'Bob', 'carol', 'dave', 'zed'])
  })
})

describe('canChallenge', () => {
  it('only an online member who is not me, while presence is known', () => {
    expect(canChallenge(member(2, 'bob', 'online'), 7, true)).toBe(true)
    expect(canChallenge(member(2, 'bob', 'playing'), 7, true)).toBe(false)
    expect(canChallenge(member(2, 'bob', 'offline'), 7, true)).toBe(false)
    expect(canChallenge(member(7, 'me', 'online'), 7, true)).toBe(false)
    expect(canChallenge(member(2, 'bob', 'online'), 7, false)).toBe(false)
  })
})

describe('time', () => {
  it('counts whole seconds left, never below zero', () => {
    expect(secondsLeft('2026-10-13T12:00:42Z', NOW)).toBe(42)
    expect(secondsLeft('2026-10-13T12:00:41.200Z', NOW)).toBe(42)
    expect(secondsLeft('2026-10-13T11:59:00Z', NOW)).toBe(0)
  })

  it('formats a countdown', () => {
    expect(countdownText(42)).toBe('0:42')
    expect(countdownText(60)).toBe('1:00')
    expect(countdownText(5)).toBe('0:05')
  })

  it('says when a member was last seen', () => {
    expect(lastSeenText('2026-10-13T09:00:00Z', NOW)).toBe('last seen 3 h ago')
    expect(lastSeenText('2026-10-13T11:59:30Z', NOW)).toBe('last seen just now')
    expect(lastSeenText(null, NOW)).toBe('not seen yet')
  })
})

describe('challenges to me', () => {
  it('names the challenger, the game type and my colour', () => {
    expect(challengeText(challenge('i1', ''))).toBe(
      'alice challenges you to Blitz 5+3, you play black',
    )
    expect(challengeText({ ...challenge('i1', ''), color: 'random' })).toBe(
      'alice challenges you to Blitz 5+3, you play a random colour',
    )
  })

  it('hides expired and answered ones before any frame says so', () => {
    const view = {
      userId: 7,
      seq: 3,
      challenges: [
        challenge('live', '2026-10-13T12:00:30Z'),
        challenge('gone', '2026-10-13T11:59:59Z'),
        challenge('answered', '2026-10-13T12:00:30Z'),
      ],
    }
    expect(openChallenges(view, NOW, new Set(['answered'])).map((c) => c.inviteId)).toEqual([
      'live',
    ])
    expect(openChallenges(undefined, NOW)).toEqual([])
  })
})

describe('challengeState', () => {
  it('follows my challenge to its end', () => {
    expect(challengeState(invite({}), NOW)).toEqual({
      kind: 'waiting',
      expiresAt: '2026-10-13T12:00:30Z',
    })
    expect(challengeState(invite({ status: 'accepted', gameId: 'g1' }), NOW)).toEqual({
      kind: 'started',
      gameId: 'g1',
    })
    expect(challengeState(invite({ status: 'declined' }), NOW)).toEqual({ kind: 'declined' })
    expect(challengeState(invite({ status: 'cancelled' }), NOW)).toEqual({ kind: 'cancelled' })
    expect(challengeState(invite({ status: 'expired' }), NOW)).toEqual({ kind: 'expired' })
  })

  it('counts an open challenge past its time as expired', () => {
    expect(challengeState(invite({ expiresAt: '2026-10-13T11:59:00Z' }), NOW)).toEqual({
      kind: 'expired',
    })
  })
})
