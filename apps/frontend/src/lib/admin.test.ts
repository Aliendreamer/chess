import { describe, expect, it } from 'vitest'
import {
  PROJECTION_GROUPS,
  checkNewMember,
  firstLine,
  isAdmin,
  isAggregateId,
  isProjectionGroup,
  isSelfHarm,
} from './admin'

describe('admin helpers', () => {
  it('knows an admin by the realm role', () => {
    expect(isAdmin({ roles: ['User', 'Admin'] })).toBe(true)
    expect(isAdmin({ roles: ['User'] })).toBe(false)
  })

  it('accepts only the projections the API has and safe aggregate ids', () => {
    expect(PROJECTION_GROUPS).toContain('chess.rm-games')
    expect(PROJECTION_GROUPS).toContain('chess.auto-review')
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

describe('member admin (member-admin)', () => {
  it('checks and trims a new member', () => {
    expect(checkNewMember({ username: ' carol ', fullName: ' Carol Doe ', email: '' })).toEqual({
      ok: true,
      member: { username: 'carol', fullName: 'Carol Doe', email: null },
    })
    expect(checkNewMember({ username: 'carol', fullName: 'C', email: 'c@club.test' })).toEqual({
      ok: true,
      member: { username: 'carol', fullName: 'C', email: 'c@club.test' },
    })
    expect(checkNewMember({ username: 'ca rol', fullName: 'C' }).ok).toBe(false)
    expect(checkNewMember({ username: 'carol', fullName: '  ' }).ok).toBe(false)
    expect(checkNewMember({ username: 'carol', fullName: 'C', email: 'nope' }).ok).toBe(false)
  })

  it('refuses deactivating yourself or removing your own role only', () => {
    expect(isSelfHarm('deactivate', { id: 7 }, 7)).toBe(true)
    expect(isSelfHarm('remove-admin', { id: 7 }, 7)).toBe(true)
    expect(isSelfHarm('reset-password', { id: 7 }, 7)).toBe(false)
    expect(isSelfHarm('deactivate', { id: 8 }, 7)).toBe(false)
  })
})
