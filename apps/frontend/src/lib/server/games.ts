import { loginHref } from '../auth'
import { apiUrl, isGuid, postCommand, readJson } from './upstream'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import type { CommandOutcome, GameCommand, GameSummary, GameView, MoveItem } from '../games'

const COMMAND_PATH: Record<GameCommand['kind'], string> = {
  move: 'moves',
  resign: 'resign',
  'draw-offer': 'draw/offer',
  'draw-accept': 'draw/accept',
  'draw-decline': 'draw/decline',
  abort: 'abort',
  claim: 'claim',
}

/** `GET /api/games/{id}/live`: the actor while playing, the replica once ended. */
export async function loadGameLive(fetchImpl: typeof fetch, id: string): Promise<GameView> {
  return readJson<GameView>(await fetchImpl(`/api/games/${id}/live`), `GET /api/games/${id}/live`)
}

/** `GET /api/games/{id}` (replica): null while the projection has not caught up with a new game (D4). */
export async function loadGameSummary(
  fetchImpl: typeof fetch,
  id: string,
): Promise<GameSummary | null> {
  const res = await fetchImpl(`/api/games/${id}`)
  if (res.status === 404) return null
  return readJson<GameSummary>(res, `GET /api/games/${id}`)
}

/** `GET /api/games/{id}/moves` (replica): empty while the projection has not caught up with a new game (D4). */
export async function loadGameMoves(fetchImpl: typeof fetch, id: string): Promise<Array<MoveItem>> {
  const res = await fetchImpl(`/api/games/${id}/moves`)
  if (res.status === 404) return []
  return readJson<Array<MoveItem>>(res, `GET /api/games/${id}/moves`)
}

export function sendGameCommand(
  fetchImpl: typeof fetch,
  id: string,
  command: GameCommand,
): Promise<CommandOutcome<GameView>> {
  const path = `/api/games/${id}/${COMMAND_PATH[command.kind]}`
  return postCommand<GameView>(
    fetchImpl,
    path,
    command.kind === 'move'
      ? { uci: command.uci }
      : command.kind === 'claim'
        ? { outcome: command.outcome }
        : undefined,
  )
}

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
  if (!isGuid(id)) return new Response('Not a game id.', { status: 400 })
  const cookie = forwardCookieHeader(request.headers.get('cookie'), cookiesAreSecure(env))
  const headers = new Headers({ accept: 'text/plain' })
  if (cookie) headers.set('cookie', cookie)

  const upstream = await fetchImpl(`${apiUrl(env)}/api/games/${id}/pgn`, { headers })
  if (upstream.status === 401) {
    return new Response(null, { status: 302, headers: { location: loginHref(`/games/${id}`) } })
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
