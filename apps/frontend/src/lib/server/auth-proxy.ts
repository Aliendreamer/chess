import { cookiesAreSecure, forwardCookieHeader, rehomeSetCookie } from './cookies'
import { apiUrl } from './config'

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
