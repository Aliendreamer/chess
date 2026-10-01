import { DEFAULT_PREFERENCES, isPreferences } from '../auth'
import { cookiesAreSecure, forwardCookieHeader, rehomeSetCookie } from './cookies'
import { apiUrl, sendCommand } from './upstream'
import type { CommandOutcome } from '../games'
import type { Me, Preferences } from '../auth'

/**
 * Server-to-server proxy for `/api/auth/<splat>`: forwards the browser's request inward with only the auth
 * cookies (mapped to API names), then relays status + Location and re-homes every Set-Cookie.
 */
export async function proxyAuth(
  request: Request,
  splat: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  const secure = cookiesAreSecure(env)
  const cookie = forwardCookieHeader(request.headers.get('cookie'), secure)
  const incoming = new URL(request.url)
  const target = `${apiUrl(env)}/api/auth/${splat}${incoming.search}`

  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  const forwardedProto =
    request.headers.get('x-forwarded-proto') ?? incoming.protocol.replace(':', '')
  headers.set('x-forwarded-proto', forwardedProto)
  headers.set('x-forwarded-host', request.headers.get('x-forwarded-host') ?? incoming.host)

  const upstream = await fetchImpl(target, {
    method: request.method,
    headers,
    redirect: 'manual',
  })

  const out = new Headers()
  const location = upstream.headers.get('location')
  if (location) out.set('location', location)
  const contentType = upstream.headers.get('content-type')
  if (contentType) out.set('content-type', contentType)
  out.set('cache-control', 'no-store')
  for (const sc of upstream.headers.getSetCookie()) {
    const rehomed = rehomeSetCookie(sc, secure)
    if (rehomed) out.append('set-cookie', rehomed)
  }

  const body =
    upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer()
  return new Response(body, { status: upstream.status, headers: out })
}

/** `GET /api/me`: 401 ⇒ null (the guard redirects); anything else non-2xx ⇒ throw. */
export async function loadMe(fetchImpl: typeof fetch): Promise<Me | null> {
  const res = await fetchImpl('/api/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`GET /api/me failed with ${res.status}`)
  return (await res.json()) as Me
}

/** `GET /api/me/preferences` (user-preferences): the defaults when signed out or when the answer is not usable. */
export async function loadPreferences(fetchImpl: typeof fetch): Promise<Preferences> {
  const res = await fetchImpl('/api/me/preferences')
  if (!res.ok) return DEFAULT_PREFERENCES
  const body: unknown = await res.json().catch(() => null)
  return isPreferences(body) ? body : DEFAULT_PREFERENCES
}

/** `PUT /api/me/preferences`: the whole set; a value the server does not offer is a 400 outcome. */
export function savePreferences(
  fetchImpl: typeof fetch,
  preferences: Preferences,
): Promise<CommandOutcome<Preferences>> {
  return sendCommand<Preferences>(fetchImpl, 'PUT', '/api/me/preferences', preferences)
}
