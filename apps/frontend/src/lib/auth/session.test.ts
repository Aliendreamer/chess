import { describe, expect, it } from 'vitest'
import { LOGIN_HREF, LOGOUT_HREF, loginHref } from './session'

describe('session hrefs', () => {
  it('are same-origin paths and encode returnTo', () => {
    expect(LOGIN_HREF).toBe('/api/auth/login')
    expect(LOGOUT_HREF).toBe('/api/auth/logout')
    expect(loginHref('/games/1?tab=moves')).toBe(
      '/api/auth/login?returnTo=%2Fgames%2F1%3Ftab%3Dmoves',
    )
  })
})
