import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOGIN_HREF, LOGOUT_HREF, login, loginHref, logout } from './session'

describe('session hrefs', () => {
  it('are same-origin paths and encode returnTo', () => {
    expect(LOGIN_HREF).toBe('/api/auth/login')
    expect(LOGOUT_HREF).toBe('/api/auth/logout')
    expect(loginHref('/games/1?tab=moves')).toBe(
      '/api/auth/login?returnTo=%2Fgames%2F1%3Ftab%3Dmoves',
    )
  })
})

describe('programmatic navigation', () => {
  const assign = vi.fn()

  afterEach(() => {
    assign.mockReset()
    vi.unstubAllGlobals()
  })

  function stubLocation(pathname: string, search: string) {
    vi.stubGlobal('window', { location: { assign, pathname, search } })
  }

  it('login defaults returnTo to the current path and query', () => {
    stubLocation('/pings/p1', '?a=1')
    login()
    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2Fpings%2Fp1%3Fa%3D1')
  })

  it('login honours an explicit returnTo', () => {
    stubLocation('/', '')
    login('/elsewhere')
    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2Felsewhere')
  })

  it('logout goes to the logout proxy, never the API host', () => {
    stubLocation('/', '')
    logout()
    expect(assign).toHaveBeenCalledWith(LOGOUT_HREF)
  })
})
