import { readJson } from './upstream'
import type { CursorPage, MyGameItem } from '../play'
import type { PlayerProfile } from '../players'

/** `GET /api/players/{id}` (replica): null for an unknown player. */
export async function loadPlayer(
  fetchImpl: typeof fetch,
  id: number,
): Promise<PlayerProfile | null> {
  const res = await fetchImpl(`/api/players/${id}`)
  if (res.status === 404) return null
  return readJson<PlayerProfile>(res, `GET /api/players/${id}`)
}

/** `GET /api/players/{id}/games`: newest first, keyset paged, each game from that player's side. */
export async function loadPlayerGames(
  fetchImpl: typeof fetch,
  id: number,
  page: { limit: number; cursor?: string | undefined },
): Promise<CursorPage<MyGameItem>> {
  const query = new URLSearchParams({ limit: String(page.limit) })
  if (page.cursor) query.set('cursor', page.cursor)
  return readJson<CursorPage<MyGameItem>>(
    await fetchImpl(`/api/players/${id}/games?${query.toString()}`),
    `GET /api/players/${id}/games`,
  )
}
