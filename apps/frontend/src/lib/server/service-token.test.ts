import { describe, expect, it, vi } from 'vitest'
import { ServiceTokenError, createServiceToken } from './service-token'

const T0 = 1_000_000

function tokenResponse(token: string, expiresIn = 300): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function setup(responses: Array<Response>) {
  let now = T0
  const fetchImpl = vi.fn(() => Promise.resolve(responses.shift() ?? tokenResponse('extra')))
  const token = createServiceToken({
    fetch: fetchImpl,
    now: () => now,
    tokenUrl: 'http://keycloak.chess.localhost/realms/chess/protocol/openid-connect/token',
    clientId: 'chess_bff',
    clientSecret: 's3cret',
  })
  return { token, fetchImpl, advance: (ms: number) => (now += ms) }
}

describe('createServiceToken', () => {
  it('fetches by client credentials on first use', async () => {
    const { token, fetchImpl } = setup([tokenResponse('t1')])

    expect(await token()).toBe('t1')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/protocol/openid-connect/token')
    const body = new URLSearchParams(init.body as string)
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'chess_bff',
      client_secret: 's3cret',
    })
  })

  it('reuses the token while it has more than 30 s left', async () => {
    const { token, fetchImpl, advance } = setup([tokenResponse('t1', 300)])
    await token()
    advance(269_000) // 31 s left

    expect(await token()).toBe('t1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refetches once it is within 30 s of expiry', async () => {
    const { token, fetchImpl, advance } = setup([tokenResponse('t1', 300), tokenResponse('t2')])
    await token()
    advance(271_000) // 29 s left

    expect(await token()).toBe('t2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('shares one fetch between concurrent callers', async () => {
    const { token, fetchImpl } = setup([tokenResponse('t1')])

    const [a, b, c] = await Promise.all([token(), token(), token()])

    expect([a, b, c]).toEqual(['t1', 't1', 't1'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('surfaces a non-2xx as a ServiceTokenError and retries on the next call', async () => {
    const { token, fetchImpl } = setup([
      new Response('{"error":"unauthorized_client"}', { status: 401 }),
      tokenResponse('t2'),
    ])

    await expect(token()).rejects.toBeInstanceOf(ServiceTokenError)
    expect(await token()).toBe('t2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
