import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  changeMember,
  createMember,
  loadAdminMembers,
  loadDeadLetters,
  replayDeadLetters,
  resetMemberPassword,
} from './admin'

type Call = { url: string; method: string; body?: string }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

describe('loadDeadLetters', () => {
  it('pages and filters by projection', async () => {
    const calls: Array<Call> = []
    await loadDeadLetters(fakeFetch(200, { items: [], nextCursor: null, limit: 50 }, calls), {
      limit: 50,
      cursor: 'c',
      groupId: 'chess.rm-games',
    })
    expect(calls[0]?.url).toBe(
      '/api/admin/projections/dead-letters?limit=50&cursor=c&groupId=chess.rm-games',
    )
  })

  it('sends a lost session to login', async () => {
    await expect(loadDeadLetters(fakeFetch(401, {}), { limit: 50 })).rejects.toSatisfy(isRedirect)
  })
})

describe('replayDeadLetters', () => {
  const body = {
    groupId: 'chess.rm-games',
    aggregateId: 'g1',
    status: 'replayed',
    applied: 2,
    error: null,
  }

  it('posts the replay and reports what was applied', async () => {
    const calls: Array<Call> = []
    expect(await replayDeadLetters(fakeFetch(200, body, calls), 'chess.rm-games', 'g1')).toEqual({
      ok: true,
      applied: 2,
    })
    expect(calls[0]).toEqual({
      url: '/api/admin/projections/chess.rm-games/dead-letters/g1/replay',
      method: 'POST',
    })
  })

  it('reports the new error when the record fails again (409)', async () => {
    expect(
      await replayDeadLetters(
        fakeFetch(409, { ...body, status: 'failed', applied: 0, error: 'still broken' }),
        'chess.rm-games',
        'g1',
      ),
    ).toEqual({ ok: false, error: 'still broken' })
  })

  it('reports a refusal (403) as an error', async () => {
    expect(await replayDeadLetters(fakeFetch(403, {}), 'chess.rm-games', 'g1')).toEqual({
      ok: false,
      error: 'Replay refused (403).',
    })
  })
})

describe('member admin (member-admin)', () => {
  const member = {
    id: 9,
    username: 'carol',
    fullName: 'Carol Doe',
    email: null,
    active: true,
    admin: false,
    createdAt: '2026-10-13T09:00:00Z',
    lastSeenAt: null,
  }

  it('lists the members', async () => {
    const calls: Array<Call> = []
    expect(await loadAdminMembers(fakeFetch(200, { items: [member] }, calls))).toEqual([member])
    expect(calls[0]?.url).toBe('/api/admin/members')
  })

  it('creates a member and hands back the temporary password', async () => {
    const calls: Array<Call> = []
    const created = { member, temporaryPassword: 'abcdefgh12345678' }
    expect(
      await createMember(fakeFetch(200, created, calls), {
        username: 'carol',
        fullName: 'Carol Doe',
      }),
    ).toEqual({ ok: true, view: created })
    expect(calls[0]).toEqual({
      url: '/api/admin/members',
      method: 'POST',
      body: JSON.stringify({ username: 'carol', fullName: 'Carol Doe', email: null }),
    })
  })

  it('a taken username is a refusal', async () => {
    const refused = { errors: [{ reason: 'The username carol is taken.' }] }
    expect(
      await createMember(fakeFetch(409, refused), { username: 'carol', fullName: 'Carol' }),
    ).toEqual({ ok: false, status: 409, error: 'The username carol is taken.' })
  })

  it('sends each action to its path', async () => {
    const calls: Array<Call> = []
    const fetchImpl = fakeFetch(200, member, calls)
    await changeMember(fetchImpl, 9, 'deactivate')
    await changeMember(fetchImpl, 9, 'reactivate')
    await changeMember(fetchImpl, 9, 'make-admin')
    await changeMember(fetchImpl, 9, 'remove-admin')
    await resetMemberPassword(fetchImpl, 9)
    expect(calls).toEqual([
      { url: '/api/admin/members/9/deactivate', method: 'POST' },
      { url: '/api/admin/members/9/reactivate', method: 'POST' },
      { url: '/api/admin/members/9/admin', method: 'PUT', body: '{"admin":true}' },
      { url: '/api/admin/members/9/admin', method: 'PUT', body: '{"admin":false}' },
      { url: '/api/admin/members/9/reset-password', method: 'POST' },
    ])
  })
})
