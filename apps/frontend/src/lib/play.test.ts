import { describe, expect, it } from 'vitest'
import { guestColor, isInviteView, isQueueView, outcomeFor, pairingGame } from './play'
import type { InviteView, QueueView } from './play'

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
