import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getPreferences, updatePreferences } from '@chess/local'
import type { Preferences } from '@chess/core'
import { ThemeProvider } from '@/theme/theme'
import { useServices } from './services-context'

interface PreferencesValue {
  preferences: Preferences
  /** Changes some preferences: shown at once, and kept in the database. */
  update: (change: Partial<Preferences>) => Promise<void>
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

export function usePreferences(): PreferencesValue {
  const value = use(PreferencesContext)
  if (!value) throw new Error('usePreferences outside PreferencesProvider')
  return value
}

/**
 * The player's display preferences from the database, as the theme of everything below (Club dark, or Parchment
 * light) and for Settings to change. Nothing shows until they are read, so the app never flashes the wrong theme.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { db } = useServices()
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  useEffect(() => {
    let live = true
    void getPreferences(db).then((p) => live && setPreferences(p))
    return () => {
      live = false
    }
  }, [db])
  const update = useCallback(
    async (change: Partial<Preferences>) => {
      setPreferences((now) => (now ? { ...now, ...change } : now))
      setPreferences(await updatePreferences(db, change))
    },
    [db],
  )
  const value = useMemo(() => (preferences ? { preferences, update } : null), [preferences, update])
  if (!value) return null
  return (
    <PreferencesContext value={value}>
      <ThemeProvider preferences={value.preferences}>{children}</ThemeProvider>
    </PreferencesContext>
  )
}
