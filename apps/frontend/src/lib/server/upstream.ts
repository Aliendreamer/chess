import { redirect } from '@tanstack/react-router'
import { loginHref } from '../auth'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import type { CommandOutcome } from '../games'

/**
 * How the BFF reaches the API: server-side environment (never import from client components), the login redirect,
 * the GUID check for ids that become part of an API path, and the read/command helpers every feature uses.
 */
type Env = NodeJS.ProcessEnv | Record<string, string | undefined>

function required(env: Env, name: string, hint: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is not set (server-side env, e.g. ${hint})`)
  return value
}

export function apiUrl(env: Env = process.env): string {
  return required(env, 'API_URL', 'http://chess-backend:8080').replace(/\/+$/, '')
}

/**
 * The PUBLIC issuer's token endpoint: the token's `iss` must match the backend's `Keycloak:Authority`, so the
 * relay fetches through the same host name the browser sees (the container resolves it via `extra_hosts`).
 */
export function keycloakTokenUrl(env: Env = process.env): string {
  return required(
    env,
    'KEYCLOAK_TOKEN_URL',
    'http://keycloak.chess.localhost/realms/chess/protocol/openid-connect/token',
  )
}

/** The relay's service identity (`chess_bff`, realm role Relay). The secret never leaves the server. */
export function relayClient(env: Env = process.env): { id: string; secret: string } {
  return {
    id: required(env, 'RELAY_CLIENT_ID', 'chess_bff'),
    secret: required(env, 'RELAY_CLIENT_SECRET', 'the chess_bff client secret'),
  }
}

/** How often an open live socket re-checks its session (default 5 minutes). */
export function relayRevalidateMs(env: Env = process.env): number {
  const raw = env.RELAY_REVALIDATE_MS
  if (raw === undefined || raw === '') return 300_000
  const ms = Number(raw)
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(`RELAY_REVALIDATE_MS must be a positive integer (ms), got "${raw}"`)
  }
  return ms
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-f:.]*:[0-9a-f:.]*$/i

/**
 * The caller's address as our one edge saw it (Traefik locally, `apps/proxy`'s nginx deployed): the rightmost
 * `X-Forwarded-For` entry, which the edge appended — anything a client wrote itself sits to its left. Without that
 * header, the socket's address. Null when neither is an address. The API rate-limits anonymous calls by it and logs it.
 */
export function clientIp(
  forwardedFor: string | null | undefined,
  socketAddress?: string | null,
): string | null {
  const edge = forwardedFor?.split(',').at(-1)?.trim()
  for (const candidate of [edge, socketAddress?.trim()]) {
    if (candidate && (IPV4.test(candidate) || IPV6.test(candidate))) return candidate
  }
  return null
}

/** Tells the API who the caller is: the backend trusts `X-Forwarded-For` from the BFF's network only. */
export function forwardClientIp(headers: Headers, ip: string | null): void {
  if (ip) headers.set('x-forwarded-for', ip)
  else headers.delete('x-forwarded-for')
}

/** Where a lost session goes: sign in again, then back to the home page. */
export const LOGIN_REDIRECT = loginHref('/')

const GUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/

/** A Guid in N or D form, lower case: the only ids the API issues. */
export function isGuid(id: string): boolean {
  return GUID.test(id)
}

/** The message of an API problem-details body (FastEndpoints puts `ThrowError`'s text in `errors[0].reason`). */
export function problemMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as { errors?: Array<{ reason?: unknown }>; detail?: unknown; title?: unknown }
    const reason = Array.isArray(b.errors) ? b.errors[0]?.reason : undefined
    if (typeof reason === 'string' && reason) return reason
    if (typeof b.detail === 'string' && b.detail) return b.detail
    if (typeof b.title === 'string' && b.title) return b.title
  }
  return `Request failed (${status}).`
}

/** A read: 401 redirects to login, any other failure throws. */
export async function readJson<T>(res: Response, what: string): Promise<T> {
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (!res.ok) throw new Error(`${what} failed with ${res.status}`)
  return (await res.json()) as T
}

/** A POST whose 4xx refusal is an outcome; 401 redirects to login, 5xx throws. */
export function postCommand<T>(
  fetchImpl: typeof fetch,
  path: string,
  body?: unknown,
): Promise<CommandOutcome<T>> {
  return sendCommand<T>(fetchImpl, 'POST', path, body)
}

/**
 * A command (POST, PUT, DELETE) whose 4xx refusal is an outcome; 401 redirects to login, 5xx throws. A 204 answers
 * with a null view.
 */
export async function sendCommand<T>(
  fetchImpl: typeof fetch,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<CommandOutcome<T>> {
  const res = await fetchImpl(
    path,
    body === undefined
      ? { method }
      : {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (res.status >= 500) throw new Error(`${method} ${path} failed with ${res.status}`)
  if (!res.ok) {
    let problem: unknown = null
    try {
      problem = await res.json()
    } catch {
      // A refusal without a JSON body still carries its status.
    }
    return { ok: false, status: res.status, error: problemMessage(problem, res.status) }
  }
  return { ok: true, view: (res.status === 204 ? null : await res.json()) as T }
}

/**
 * `GET /pgn/…` on the app origin: the BFF fetches `apiPath` server-to-server with the caller's session and hands it over
 * as a `.pgn` file; a lost session goes to login and back to `backTo`. Games and studies both download through it.
 */
export async function pgnDownload(
  request: Request,
  apiPath: string,
  backTo: string,
  fileName: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  const cookie = forwardCookieHeader(request.headers.get('cookie'), cookiesAreSecure(env))
  const headers = new Headers({ accept: 'text/plain' })
  if (cookie) headers.set('cookie', cookie)
  forwardClientIp(headers, clientIp(request.headers.get('x-forwarded-for')))

  const upstream = await fetchImpl(`${apiUrl(env)}${apiPath}`, { headers })
  if (upstream.status === 401) {
    return new Response(null, { status: 302, headers: { location: loginHref(backTo) } })
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status })

  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      'content-type': 'application/x-chess-pgn; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'private, no-store',
    },
  })
}
