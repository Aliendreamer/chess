import { createContext, use, useMemo, type ReactNode } from 'react'
import { DEFAULT_PREFERENCES } from '@chess/core'
import type { Preferences } from '@chess/core'
import { BOARDS, COLORS, type BoardColors, type Colors } from './tokens'

/** What a component draws with: the site theme's colours, the board theme's squares, and the player's preferences. */
export interface Theme {
  colors: Colors
  board: BoardColors
  preferences: Preferences
}

export function themeFor(preferences: Preferences): Theme {
  return {
    colors: COLORS[preferences.siteTheme],
    board: BOARDS[preferences.boardTheme],
    preferences,
  }
}

const ThemeContext = createContext<Theme>(themeFor(DEFAULT_PREFERENCES))

/** The player's preferences as the theme of everything below (Club dark unless they pick Parchment). */
export function ThemeProvider({
  preferences,
  children,
}: {
  preferences: Preferences
  children: ReactNode
}) {
  const theme = useMemo(() => themeFor(preferences), [preferences])
  return <ThemeContext value={theme}>{children}</ThemeContext>
}

export function useTheme(): Theme {
  return use(ThemeContext)
}
