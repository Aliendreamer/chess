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
