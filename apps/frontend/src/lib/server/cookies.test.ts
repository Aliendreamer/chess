import { describe, expect, it } from 'vitest'
import { appCookieName, cookiesAreSecure, forwardCookieHeader, rehomeSetCookie } from './cookies'

describe('cookiesAreSecure', () => {
  it('is gated on COOKIE_SECURE, not NODE_ENV', () => {
    expect(cookiesAreSecure({ NODE_ENV: 'production' })).toBe(false)
    expect(cookiesAreSecure({ COOKIE_SECURE: 'true' })).toBe(true)
    expect(cookiesAreSecure({ COOKIE_SECURE: 'false' })).toBe(false)
    expect(cookiesAreSecure({})).toBe(false)
  })
})

describe('rehomeSetCookie', () => {
  const upstream =
    'mp_sid=abc123; expires=Wed, 30 Sep 2026 10:00:00 GMT; domain=.chess.localhost; path=/; httponly; samesite=lax'

  it('dev: strips Domain, keeps lifetime, forces Path/HttpOnly/SameSite, no Secure', () => {
    const out = rehomeSetCookie(upstream, false)
    expect(out).toBe(
      'mp_sid=abc123; expires=Wed, 30 Sep 2026 10:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    )
    expect(out).not.toMatch(/domain/i)
  })

  it('prod: adds __Host- prefix and Secure', () => {
    const out = rehomeSetCookie('mp_sid=abc; Max-Age=3600; Domain=.chess.localhost; Path=/', true)
    expect(out).toBe('__Host-mp_sid=abc; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax; Secure')
  })

  it('keeps a clearing cookie clearing (expires in the past, empty value)', () => {
    const out = rehomeSetCookie(
      'mp_pkce=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.chess.localhost; path=/',
      false,
    )
    expect(out).toBe(
      'mp_pkce=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    )
  })

  it('drops cookies that are not auth cookies, and garbage', () => {
    expect(rehomeSetCookie('tracking=1; Path=/', false)).toBeNull()
    expect(rehomeSetCookie('', false)).toBeNull()
    expect(rehomeSetCookie('=novalue', false)).toBeNull()
  })

  it('appCookieName maps both ways consistently', () => {
    expect(appCookieName('mp_sid', true)).toBe('__Host-mp_sid')
    expect(appCookieName('mp_sid', false)).toBe('mp_sid')
  })
})

describe('forwardCookieHeader', () => {
  it('dev: forwards only auth cookies under their API names', () => {
    expect(forwardCookieHeader('theme=dark; mp_sid=abc; mp_pkce=n.v; other=1', false)).toBe(
      'mp_sid=abc; mp_pkce=n.v',
    )
  })

  it('prod: maps __Host- names back and ignores bare names it did not issue', () => {
    expect(forwardCookieHeader('__Host-mp_sid=abc; mp_sid=spoof', true)).toBe(
      'mp_sid=abc; mp_sid=spoof',
    )
    expect(forwardCookieHeader('__Host-mp_pkce=n.v', true)).toBe('mp_pkce=n.v')
  })

  it('empty or irrelevant headers forward nothing', () => {
    expect(forwardCookieHeader(null, false)).toBeNull()
    expect(forwardCookieHeader(undefined, true)).toBeNull()
    expect(forwardCookieHeader('', false)).toBeNull()
    expect(forwardCookieHeader('theme=dark', false)).toBeNull()
    expect(forwardCookieHeader('=broken; ;', false)).toBeNull()
  })
})
