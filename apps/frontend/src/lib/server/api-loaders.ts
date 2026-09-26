import { redirect } from '@tanstack/react-router'
import type { PingState } from '../pings'

/** Mirrors the API's `GET api/me` response. */
export interface Me {
  id: number
  subject: string
  email?: string | null
  roles: Array<string>
  /** The display name (D23): Keycloak `preferred_username`, else `Player {id}`. */
  username: string
}

export const ADMIN_ROLE = 'Admin'

export function hasRole(me: Me | null | undefined, role: string): boolean {
  return me?.roles.includes(role) ?? false
}

const LOGIN_REDIRECT = '/api/auth/login?returnTo=/'

/** `GET /api/me`: 401 ⇒ null (the guard redirects); anything else non-2xx ⇒ throw. */
export async function loadMe(fetchImpl: typeof fetch): Promise<Me | null> {
  const res = await fetchImpl('/api/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`GET /api/me failed with ${res.status}`)
  return (await res.json()) as Me
}

/** `GET /api/pings/{id}/live`: the actor's own state — read-your-write, replica lag irrelevant. */
export async function loadPingLive(fetchImpl: typeof fetch, id: string): Promise<PingState> {
  const res = await fetchImpl(`/api/pings/${encodeURIComponent(id)}/live`)
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (!res.ok) throw new Error(`GET /api/pings/${id}/live failed with ${res.status}`)
  return (await res.json()) as PingState
}

/** `POST /api/pings/{id}`: the command. The reply is the actor's post-persist state. */
export async function sendPing(
  fetchImpl: typeof fetch,
  id: string,
  text: string,
): Promise<PingState> {
  const res = await fetchImpl(`/api/pings/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (!res.ok) throw new Error(`POST /api/pings/${id} failed with ${res.status}`)
  return (await res.json()) as PingState
}
