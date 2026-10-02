import { describe, expect, it, vi } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import { DEFAULT_PREFERENCES } from '../auth'
import { loadMe, loadPreferences, proxyAuth, savePreferences } from './auth'
import type { Me } from '../auth'

const env = { API_URL: 'http://chess-backend:8080/' }

function upstream(
  status: number,
  headers: Record<string, string> | Array<[string, string]>,
  body = '',
) {
  const h = new Headers()
  for (const [k, v] of Array.isArray(headers) ? headers : Object.entries(headers)) h.append(k, v)
  return new Response(body, { status, headers: h })
}

describe('proxyAuth', () => {
  it('forwards only auth cookies, relays status + Location, re-homes Set-Cookie', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        upstream(302, [
          [
            'location',
            'http://keycloak.chess.localhost/realms/chess/protocol/openid-connect/auth?x=1',
          ],
          [
            'set-cookie',
            'mp_pkce=n.v; expires=Wed, 30 Sep 2026 10:00:00 GMT; domain=.chess.localhost; path=/; httponly; samesite=lax',
          ],
          ['set-cookie', 'unrelated=1; path=/'],
        ]),
      ),
    )
    const req = new Request('http://app.chess.localhost/api/auth/login?returnTo=%2Fgames', {
      headers: { cookie: 'theme=dark; mp_sid=abc', 'x-forwarded-for': '1.2.3.4, 203.0.113.7' },
    })

    const res = await proxyAuth(req, 'login', fetchImpl, env)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://chess-backend:8080/api/auth/login?returnTo=%2Fgames')
    expect(init.redirect).toBe('manual')
    expect(init.method).toBe('GET')
    const sent = new Headers(init.headers)
    expect(sent.get('cookie')).toBe('mp_sid=abc')
    expect(sent.get('x-forwarded-host')).toBe('app.chess.localhost')
    expect(sent.get('x-forwarded-proto')).toBe('http')
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'http://keycloak.chess.localhost/realms/chess/protocol/openid-connect/auth?x=1',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    const setCookies = res.headers.getSetCookie()
    expect(setCookies).toEqual([
      'mp_pkce=n.v; expires=Wed, 30 Sep 2026 10:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    ])
  })

  it('prod: __Host- cookies go in, bare names come out re-prefixed', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        upstream(302, [
          ['location', 'http://app.chess.localhost/'],
          ['set-cookie', 'mp_sid=raw; Max-Age=28800; Domain=.chess.localhost; Path=/; HttpOnly'],
        ]),
      ),
    )
    const req = new Request('https://app.example.com/api/auth/callback?code=c&state=s', {
      headers: { cookie: '__Host-mp_pkce=n.v', 'x-forwarded-proto': 'https' },
    })

    const res = await proxyAuth(req, 'callback', fetchImpl, { ...env, COOKIE_SECURE: 'true' })

    const sent = new Headers(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    )
    expect(sent.get('cookie')).toBe('mp_pkce=n.v')
    expect(res.headers.getSetCookie()).toEqual([
      '__Host-mp_sid=raw; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax; Secure',
    ])
  })

  it('passes bodies and content-type through, sends no cookie header when there is none', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        upstream(400, { 'content-type': 'application/problem+json' }, '{"title":"bad"}'),
      ),
    )
    const res = await proxyAuth(
      new Request('http://app.chess.localhost/api/auth/callback'),
      'callback',
      fetchImpl,
      env,
    )

    const sent = new Headers(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    )
    expect(sent.has('cookie')).toBe(false)
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    await expect(res.text()).resolves.toBe('{"title":"bad"}')
  })

  it('fails loudly without API_URL', async () => {
    await expect(
      proxyAuth(new Request('http://app.chess.localhost/api/auth/login'), 'login', fetch, {}),
    ).rejects.toThrow(/API_URL/)
  })
})

function fetchWith(status: number, body: string, contentType = 'application/json'): typeof fetch {
  return () =>
    Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } }))
}

const me: Me = { id: 1, subject: 'sub-1', email: 'a@b.c', roles: ['User'], username: 'ann' }

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

describe('preferences', () => {
  const blue = { ...DEFAULT_PREFERENCES, boardTheme: 'blue' as const }

  it('reads the saved preferences', async () => {
    await expect(loadPreferences(fetchWith(200, JSON.stringify(blue)))).resolves.toEqual(blue)
  })

  it('falls back to the defaults when signed out or the answer is not usable', async () => {
    await expect(loadPreferences(fetchWith(401, ''))).resolves.toEqual(DEFAULT_PREFERENCES)
    await expect(loadPreferences(fetchWith(200, '{"boardTheme":"neon"}'))).resolves.toEqual(
      DEFAULT_PREFERENCES,
    )
  })

  it('saves with a PUT of the whole set', async () => {
    let seen: { method?: string | undefined; body?: unknown } = {}
    const fetchImpl: typeof fetch = (_url, init) => {
      seen = { method: init?.method, body: init?.body }
      return Promise.resolve(new Response(JSON.stringify(blue), { status: 200 }))
    }
    await expect(savePreferences(fetchImpl, blue)).resolves.toEqual({ ok: true, view: blue })
    expect(seen.method).toBe('PUT')
    expect(JSON.parse(String(seen.body))).toEqual(blue)
  })
})
