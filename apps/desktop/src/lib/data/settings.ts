import { withDefaults } from '@chess/core'
import type { Preferences } from '@chess/core'
import type { Db } from './db'

/** Small values the app keeps between starts (desktop-app D4): JSON under a key in `settings`. */
export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    key,
  ])
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  )
}

/** The player's display preferences, completed with the defaults for anything a set saved earlier lacks. */
export async function getPreferences(db: Db): Promise<Preferences> {
  return withDefaults(await getSetting<Partial<Preferences>>(db, 'preferences', {}))
}

/** Changes some of the preferences, keeping the rest. */
export async function updatePreferences(
  db: Db,
  change: Partial<Preferences>,
): Promise<Preferences> {
  const next = { ...(await getPreferences(db)), ...change }
  await setSetting(db, 'preferences', next)
  return next
}
