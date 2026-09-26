import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { apiUrl } from './config'

const GUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/

/**
 * `GET /pgn/{id}` on the app origin: the BFF fetches `GET /api/games/{id}/pgn` server-to-server with the caller's
 * session and hands it over as a `.pgn` file. Not under `/api/` — the edge sends that prefix to the API itself.
 */
export async function downloadPgn(
  request: Request,
  id: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  if (!GUID.test(id)) return new Response('Not a game id.', { status: 400 })
  const cookie = forwardCookieHeader(request.headers.get('cookie'), cookiesAreSecure(env))
  const headers = new Headers({ accept: 'text/plain' })
  if (cookie) headers.set('cookie', cookie)

  const upstream = await fetchImpl(`${apiUrl(env)}/api/games/${id}/pgn`, { headers })
  if (upstream.status === 401) {
    const returnTo = encodeURIComponent(`/games/${id}`)
    return new Response(null, {
      status: 302,
      headers: { location: `/api/auth/login?returnTo=${returnTo}` },
    })
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status })

  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      'content-type': 'application/x-chess-pgn; charset=utf-8',
      'content-disposition': `attachment; filename="chess-${id.replaceAll('-', '')}.pgn"`,
      'cache-control': 'private, no-store',
    },
  })
}
