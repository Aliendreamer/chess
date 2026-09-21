import { describe, expect, it, vi } from 'vitest'
import { proxyAuth } from './auth-proxy'

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
      headers: { cookie: 'theme=dark; mp_sid=abc' },
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
