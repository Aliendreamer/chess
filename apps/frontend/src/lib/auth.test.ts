import { describe, expect, it } from 'vitest'
import { ANIMATIONS, DEFAULT_PREFERENCES, animationMs, isPreferences, withDefaults } from '@chess/core'
import { LOGIN_HREF, LOGOUT_HREF, loginHref } from './auth'

describe('session hrefs', () => {
  it('are same-origin paths and encode returnTo', () => {
    expect(LOGIN_HREF).toBe('/api/auth/login')
    expect(LOGOUT_HREF).toBe('/api/auth/logout')
    expect(loginHref('/games/1?tab=moves')).toBe(
      '/api/auth/login?returnTo=%2Fgames%2F1%3Ftab%3Dmoves',
    )
  })
})

describe('preferences', () => {
  it('default to Brown, Cburnett, normal animation, coordinates and the dark site', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      boardTheme: 'brown',
      pieceSet: 'cburnett',
      animation: 'normal',
      coordinates: true,
      siteTheme: 'dark',
      analysisBar: true,
      analysisLines: true,
      playBar: false,
      playLines: false,
    })
  })

  it('animate for 0, 120 or 200 ms', () => {
    expect(ANIMATIONS.map(animationMs)).toEqual([0, 120, 200])
  })

  it('accept only the values the site offers', () => {
    expect(isPreferences(DEFAULT_PREFERENCES)).toBe(true)
    expect(isPreferences({ ...DEFAULT_PREFERENCES, boardTheme: 'neon' })).toBe(false)
    expect(isPreferences({ ...DEFAULT_PREFERENCES, coordinates: 'yes' })).toBe(false)
    expect(isPreferences({ ...DEFAULT_PREFERENCES, siteTheme: 'light' })).toBe(true)
    expect(isPreferences({ ...DEFAULT_PREFERENCES, playBar: 'yes' })).toBe(false)
  })

  it('accept a set saved before the engine switches, which then take their defaults', () => {
    const { analysisBar, analysisLines, playBar, playLines, ...older } = DEFAULT_PREFERENCES
    expect([analysisBar, analysisLines, playBar, playLines]).toEqual([true, true, false, false])
    expect(isPreferences(older)).toBe(true)
    expect(withDefaults({ ...older, boardTheme: 'blue' })).toEqual({
      ...DEFAULT_PREFERENCES,
      boardTheme: 'blue',
    })
  })
})
