import { describe, expect, it } from 'vitest'
import { isPingState } from './pings'
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
