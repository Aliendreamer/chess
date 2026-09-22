import { describe, expect, it } from 'vitest'
import { mapHubMessage, pingIdFromUrl } from './ping-relay'
import type { PingState } from './ping-relay'

const state: PingState = { pingId: 'p1', count: 1, lastText: 'hi', lastAt: null, lastSeq: 1 }

describe('mapHubMessage', () => {
  it('maps state messages and ignores others', () => {
    expect(mapHubMessage('state', [state])).toEqual({ kind: 'state', state })
    expect(mapHubMessage('other', [state])).toBeNull()
    expect(mapHubMessage('state', [])).toBeNull()
  })

  it('drops payloads that are not a ping state', () => {
    expect(mapHubMessage('state', [null])).toBeNull()
    expect(mapHubMessage('state', ['p1'])).toBeNull()
    expect(mapHubMessage('state', [{ count: 1 }])).toBeNull()
  })
})

describe('pingIdFromUrl', () => {
  it('takes the last segment of the relay path', () => {
    expect(pingIdFromUrl('http://app.chess.localhost/api/ws/pings/abc-1')).toBe('abc-1')
    expect(pingIdFromUrl('/api/ws/pings/abc-1')).toBe('abc-1')
    expect(pingIdFromUrl('/api/ws/pings/abc-1?x=1')).toBe('abc-1')
  })

  it('rejects ids the backend would reject, so a bad id never opens a hub connection', () => {
    // Backend contract: PingIds.Pattern === '^[a-z0-9-]{1,64}$'.
    expect(pingIdFromUrl('/api/ws/pings/Abc')).toBeNull()
    expect(pingIdFromUrl('/api/ws/pings/a b')).toBeNull()
    expect(pingIdFromUrl('/api/ws/pings/')).toBeNull()
    expect(pingIdFromUrl(`/api/ws/pings/${'a'.repeat(65)}`)).toBeNull()
    expect(pingIdFromUrl(undefined)).toBeNull()
  })
})
