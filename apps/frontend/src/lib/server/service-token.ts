/**
 * The relay's service token (`chess_bff`, client credentials), cached until 30 s before it expires. SignalR asks for
 * it on every (re)connect through `accessTokenFactory`; concurrent askers share one in-flight fetch, and a failed
 * fetch is not cached, so the next ask retries.
 */

export class ServiceTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServiceTokenError'
  }
}

export interface ServiceTokenDeps {
  fetch: typeof fetch
  now: () => number
  tokenUrl: string
  clientId: string
  clientSecret: string
}

const REFRESH_MARGIN_MS = 30_000

export function createServiceToken(deps: ServiceTokenDeps): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null
  let inFlight: Promise<string> | null = null

  async function fetchToken(): Promise<string> {
    const res = await deps.fetch(deps.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
      }).toString(),
    })
    if (!res.ok) {
      throw new ServiceTokenError(`token endpoint returned ${res.status}`)
    }
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      throw new ServiceTokenError('token endpoint returned no access_token/expires_in')
    }
    cached = { token: body.access_token, expiresAt: deps.now() + body.expires_in * 1000 }
    return body.access_token
  }

  return () => {
    if (cached && cached.expiresAt - deps.now() > REFRESH_MARGIN_MS) {
      return Promise.resolve(cached.token)
    }
    inFlight ??= fetchToken().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
