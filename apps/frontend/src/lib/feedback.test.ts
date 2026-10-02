import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pageTitle, rematchState, tabState, useTabSignals } from './feedback'
import type { GameView } from './games'
import type { InviteView } from './play'

const NAMES = { white: 'ann', black: 'bob' }
const ANN = 1
const BOB = 2

function view(over: Partial<GameView> = {}): GameView {
  return {
    gameId: 'g',
    whiteId: ANN,
    blackId: BOB,
    timeControl: '3+2',
    status: 'playing',
    fen: 'fen',
    ply: 4,
    sideToMove: 'white',
    lastUci: null,
    lastSan: null,
    whiteMs: 1,
    blackMs: 1,
    clockAt: '2026-10-01T00:00:00Z',
    drawOfferedBy: null,
    result: null,
    reason: null,
    seq: 5,
    ...over,
  }
}

describe('tabState', () => {
  it('my move: the dot and the opponent', () => {
    expect(tabState(view(), ANN, NAMES)).toEqual({ title: '● Your move · vs bob', turn: true })
  })

  it("the opponent's move: the plain title", () => {
    expect(tabState(view(), BOB, NAMES)).toEqual({ title: 'ann vs bob · Chess', turn: false })
  })

  it('a draw offered to me wins over the move', () => {
    expect(tabState(view({ drawOfferedBy: BOB }), ANN, NAMES)).toEqual({
      title: '● Draw offered · vs bob',
      turn: true,
    })
    expect(tabState(view({ drawOfferedBy: ANN }), ANN, NAMES).title).toBe('● Your move · vs bob')
  })

  it('a spectator never sees the signals', () => {
    expect(tabState(view(), 99, NAMES)).toEqual({ title: 'ann vs bob · Chess', turn: false })
  })

  it('an ended game is plain', () => {
    expect(tabState(view({ status: 'ended' }), ANN, NAMES).turn).toBe(false)
  })
})

describe('rematchState', () => {
  const invite = (over: Partial<InviteView>): InviteView => ({
    inviteId: 'g',
    creatorId: ANN,
    forId: BOB,
    timeControl: '3+2',
    color: 'black',
    status: 'open',
    gameId: null,
    createdAt: '',
    expiresAt: '',
    seq: 1,
    ...over,
  })

  it('nothing asked yet', () => {
    expect(rematchState(undefined, ANN)).toEqual({ kind: 'none' })
  })

  it('I asked and wait', () => {
    expect(rematchState(invite({}), ANN)).toEqual({ kind: 'offered' })
  })

  it('they asked me', () => {
    expect(rematchState(invite({}), BOB)).toEqual({ kind: 'asked' })
  })

  it('agreed: the new game', () => {
    expect(rematchState(invite({ status: 'accepted', gameId: 'next' }), BOB)).toEqual({
      kind: 'started',
      gameId: 'next',
    })
  })

  it('cancelled or expired is gone', () => {
    expect(rematchState(invite({ status: 'expired' }), BOB)).toEqual({ kind: 'gone' })
  })
})

describe('pageTitle', () => {
  it('names the page before the site', () => {
    expect(pageTitle('History')).toBe('History · Chess')
    expect(pageTitle('testuser vs player')).toBe('testuser vs player · Chess')
    expect(pageTitle()).toBe('Chess')
    expect(pageTitle('')).toBe('Chess')
  })
})

describe('useTabSignals', () => {
  afterEach(cleanup)

  it('leaves the title to the next page when the game closes, and puts the plain favicon back', () => {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    document.head.appendChild(icon)
    const { unmount } = renderHook(() =>
      useTabSignals({ title: '● Your move · vs player', turn: true }),
    )
    expect(document.title).toBe('● Your move · vs player')
    expect(icon.href).toContain('/favicon-turn.svg')

    document.title = 'History · Chess' // the next route's head, set before this page's cleanup runs
    unmount()
    expect(document.title).toBe('History · Chess')
    expect(icon.href).toMatch(/\/favicon\.svg$/)
    icon.remove()
  })
})
