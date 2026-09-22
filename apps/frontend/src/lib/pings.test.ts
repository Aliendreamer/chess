import { describe, expect, it } from 'vitest'
import { isPingState, parseFrame } from './pings'
import type { PingState } from './pings'

const state: PingState = { pingId: 'p1', count: 1, lastText: 'hi', lastAt: null, lastSeq: 1 }

describe('isPingState', () => {
  it('accepts a state and rejects anything else', () => {
    expect(isPingState(state)).toBe(true)
    expect(isPingState({ pingId: 'p1' })).toBe(false)
    expect(isPingState(null)).toBe(false)
    expect(isPingState('p1')).toBe(false)
  })
})

describe('parseFrame', () => {
  it('parses the frames the relay sends', () => {
    expect(parseFrame(JSON.stringify({ kind: 'state', state }))).toEqual({ kind: 'state', state })
    expect(parseFrame(JSON.stringify({ kind: 'error', message: 'hub unavailable' }))).toEqual({
      kind: 'error',
      message: 'hub unavailable',
    })
  })

  it('returns null for junk rather than throwing at the socket', () => {
    expect(parseFrame('not json')).toBeNull()
    expect(parseFrame(JSON.stringify({ kind: 'state' }))).toBeNull()
    expect(parseFrame(JSON.stringify({ kind: 'other', state }))).toBeNull()
    expect(parseFrame(JSON.stringify({ kind: 'error' }))).toBeNull()
  })
})
