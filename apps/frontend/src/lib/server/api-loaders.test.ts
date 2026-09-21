import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { ADMIN_ROLE, hasRole, loadHealth, loadMe, settle } from './api-loaders'
import type { Me } from './api-loaders'

function fetchWith(status: number, body: string, contentType = 'application/json'): typeof fetch {
  return () =>
    Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } }))
}

const me: Me = { id: 1, subject: 'sub-1', email: 'a@b.c', roles: ['User'] }

describe('loadMe', () => {
  it('returns the identity on 200', async () => {
    await expect(loadMe(fetchWith(200, JSON.stringify(me)))).resolves.toEqual(me)
  })
  it('returns null on 401 so the guard can redirect', async () => {
    await expect(loadMe(fetchWith(401, ''))).resolves.toBeNull()
  })
  it('throws on other failures', async () => {
    await expect(loadMe(fetchWith(500, 'boom'))).rejects.toThrow(/500/)
  })
})

describe('loadHealth', () => {
  it('returns the status text', async () => {
    const h = await loadHealth(fetchWith(200, 'Healthy', 'text/plain'))
    expect(h.status).toBe('Healthy')
    expect(h.checkedAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })
  it('defaults an empty body to Healthy', async () => {
    expect((await loadHealth(fetchWith(200, '', 'text/plain'))).status).toBe('Healthy')
  })
  it('redirects to login on 401', async () => {
    const err = await loadHealth(fetchWith(401, '')).catch((e: unknown) => e)
    expect(isRedirect(err)).toBe(true)
  })
  it('throws on 5xx', async () => {
    await expect(loadHealth(fetchWith(503, 'Unhealthy'))).rejects.toThrow(/503/)
  })
})

describe('settle', () => {
  it('wraps data', async () => {
    expect(await settle(Promise.resolve(42))).toEqual({ data: 42, error: false })
  })
  it('wraps errors as a degraded tile', async () => {
    expect(await settle(Promise.reject(new Error('down')))).toEqual({ data: null, error: true })
  })
  it('re-throws redirects so a revoked session still bounces to login', async () => {
    const err = await settle(loadHealth(fetchWith(401, ''))).catch((e: unknown) => e)
    expect(isRedirect(err)).toBe(true)
  })
})

describe('hasRole', () => {
  it('checks roles and tolerates null', () => {
    expect(hasRole({ ...me, roles: [ADMIN_ROLE] }, ADMIN_ROLE)).toBe(true)
    expect(hasRole(me, ADMIN_ROLE)).toBe(false)
    expect(hasRole(null, ADMIN_ROLE)).toBe(false)
    expect(hasRole(undefined, 'User')).toBe(false)
  })
})
