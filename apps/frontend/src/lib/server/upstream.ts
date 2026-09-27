import { redirect } from '@tanstack/react-router'
import { loginHref } from '../auth'

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

/** Where a lost session goes: sign in again, then back to the home page. */
export const LOGIN_REDIRECT = loginHref('/')

const GUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/

/** A Guid in N or D form, lower case: the only ids the API issues. */
export function isGuid(id: string): boolean {
  return GUID.test(id)
}

/** What a command answers (D8): refusals (403/404/409/422) are shown in the page, not thrown. */
export type CommandOutcome<T> = { ok: true; view: T } | { ok: false; status: number; error: string }

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
export async function postCommand<T>(
  fetchImpl: typeof fetch,
  path: string,
  body?: unknown,
): Promise<CommandOutcome<T>> {
  const res = await fetchImpl(
    path,
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (res.status >= 500) throw new Error(`POST ${path} failed with ${res.status}`)
  if (!res.ok) {
    let problem: unknown = null
    try {
      problem = await res.json()
    } catch {
      // A refusal without a JSON body still carries its status.
    }
    return { ok: false, status: res.status, error: problemMessage(problem, res.status) }
  }
  return { ok: true, view: (await res.json()) as T }
}
