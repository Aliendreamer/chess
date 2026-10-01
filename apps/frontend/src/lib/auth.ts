import { createContext } from 'react'
import { BOARD_THEMES } from './board'
import type { BoardTheme } from './board'

/** Who is signed in, their display preferences, and the same-origin auth entry points. No API host in the client. */
export const LOGIN_HREF = '/api/auth/login'
export const LOGOUT_HREF = '/api/auth/logout'

export function loginHref(returnTo: string): string {
  return `${LOGIN_HREF}?returnTo=${encodeURIComponent(returnTo)}`
}

/** Mirrors the API's `GET api/me` response. */
export interface Me {
  id: number
  subject: string
  email?: string | null
  roles: Array<string>
  /** The display name (D23): Keycloak `preferred_username`, else `Player {id}`. */
  username: string
}

export const ANIMATIONS = ['off', 'fast', 'normal'] as const
export type Animation = (typeof ANIMATIONS)[number]
export const SITE_THEMES = ['dark', 'light'] as const
export type SiteTheme = (typeof SITE_THEMES)[number]
export const PIECE_SETS = ['cburnett'] as const

/** Mirrors the API's `GET api/me/preferences` (user-preferences); the server refuses any other value. */
export interface Preferences {
  boardTheme: BoardTheme
  pieceSet: (typeof PIECE_SETS)[number]
  animation: Animation
  coordinates: boolean
  siteTheme: SiteTheme
}

export const DEFAULT_PREFERENCES: Preferences = {
  boardTheme: 'brown',
  pieceSet: 'cburnett',
  animation: 'normal',
  coordinates: true,
  siteTheme: 'dark',
}

const ANIMATION_MS: Record<Animation, number> = { off: 0, fast: 120, normal: 200 }

export function animationMs(animation: Animation): number {
  return ANIMATION_MS[animation]
}

export function isPreferences(value: unknown): value is Preferences {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const one = (allowed: ReadonlyArray<string>, x: unknown) =>
    typeof x === 'string' && allowed.includes(x)
  return (
    one(BOARD_THEMES, v['boardTheme']) &&
    one(PIECE_SETS, v['pieceSet']) &&
    one(ANIMATIONS, v['animation']) &&
    typeof v['coordinates'] === 'boolean' &&
    one(SITE_THEMES, v['siteTheme'])
  )
}

/** The signed-in user's preferences for everything under the Shell (the board reads animation and coordinates). */
export const PreferencesContext = createContext<Preferences>(DEFAULT_PREFERENCES)
