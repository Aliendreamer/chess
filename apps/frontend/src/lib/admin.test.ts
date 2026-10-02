import { describe, expect, it } from 'vitest'
import { PROJECTION_GROUPS, firstLine, isAdmin, isAggregateId, isProjectionGroup } from './admin'

describe('admin helpers', () => {
  it('knows an admin by the realm role', () => {
    expect(isAdmin({ roles: ['User', 'Admin'] })).toBe(true)
    expect(isAdmin({ roles: ['User'] })).toBe(false)
  })

  it('accepts only the projections the API has and safe aggregate ids', () => {
    expect(PROJECTION_GROUPS).toContain('chess.rm-games')
    expect(isProjectionGroup('chess.rm-games')).toBe(true)
    expect(isProjectionGroup('chess.rm-games/../x')).toBe(false)
    expect(isAggregateId('0199f1c2a3b47c5d8e9f0a1b2c3d4e5f')).toBe(true)
    expect(isAggregateId('ping-abc:1')).toBe(true)
    expect(isAggregateId('a/b')).toBe(false)
    expect(isAggregateId('')).toBe(false)
  })

  it('shows the first line of a long error', () => {
    expect(firstLine('ProjectionGapException: gap\n   at X.Y()')).toBe(
      'ProjectionGapException: gap',
    )
  })
})
