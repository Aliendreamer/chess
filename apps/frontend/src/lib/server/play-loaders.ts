import { redirect } from '@tanstack/react-router'
import { postCommand } from './game-loaders'
import type { CommandOutcome } from './game-loaders'
import type { CursorPage, InviteView, MyGameItem, QueueStatus } from '../play'

const LOGIN_REDIRECT = '/api/auth/login?returnTo=/'

/**
 * `POST /api/matchmaking/{tc}`. A plain join always seeks a new game; a heartbeat (`?heartbeat=true`, every 25 s
 * while waiting) keeps the place and may be answered with a pairing it raced (D6).
 */
export function joinQueue(
  fetchImpl: typeof fetch,
  timeControl: string,
  heartbeat: boolean,
): Promise<CommandOutcome<QueueStatus>> {
  return postCommand<QueueStatus>(
    fetchImpl,
    `/api/matchmaking/${timeControl}${heartbeat ? '?heartbeat=true' : ''}`,
  )
}

/** `DELETE /api/matchmaking/{tc}`: best effort (the entry expires anyway), but a lost session still redirects. */
export async function leaveQueue(fetchImpl: typeof fetch, timeControl: string): Promise<void> {
  const res = await fetchImpl(`/api/matchmaking/${timeControl}`, { method: 'DELETE' })
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
}

export function createInvite(
  fetchImpl: typeof fetch,
  input: { timeControl: string; color: InviteView['color'] },
): Promise<CommandOutcome<InviteView>> {
  return postCommand<InviteView>(fetchImpl, '/api/invites', input)
}

/** `GET /api/invites/{id}`: null when there is no such invite (or the id is not one). */
export async function loadInvite(fetchImpl: typeof fetch, id: string): Promise<InviteView | null> {
  const res = await fetchImpl(`/api/invites/${id}`)
  if (res.status === 404 || res.status === 400) return null
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (!res.ok) throw new Error(`GET /api/invites/${id} failed with ${res.status}`)
  return (await res.json()) as InviteView
}

export function acceptInvite(
  fetchImpl: typeof fetch,
  id: string,
): Promise<CommandOutcome<InviteView>> {
  return postCommand<InviteView>(fetchImpl, `/api/invites/${id}/accept`)
}

export function cancelInvite(
  fetchImpl: typeof fetch,
  id: string,
): Promise<CommandOutcome<InviteView>> {
  return postCommand<InviteView>(fetchImpl, `/api/invites/${id}/cancel`)
}

/** `GET /api/me/games`: newest first, keyset paged. */
export async function loadMyGames(
  fetchImpl: typeof fetch,
  page: { limit: number; cursor?: string | undefined },
): Promise<CursorPage<MyGameItem>> {
  const query = new URLSearchParams({ limit: String(page.limit) })
  if (page.cursor) query.set('cursor', page.cursor)
  const res = await fetchImpl(`/api/me/games?${query.toString()}`)
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (!res.ok) throw new Error(`GET /api/me/games failed with ${res.status}`)
  return (await res.json()) as CursorPage<MyGameItem>
}
