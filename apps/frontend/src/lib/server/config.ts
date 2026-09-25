/** Server-side only. Never import from client components. */
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
