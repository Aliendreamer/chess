import { isGuid, pgnDownload, postCommand, readJson } from './upstream'
import type {
  CommandOutcome,
  EngineLevel,
  GameCommand,
  GameSummary,
  GameView,
  MoveItem,
} from '../games'

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

/** `POST /api/engine-games`: an untimed game against the computer (engine-play D7). Refusals are outcomes. */
export function startEngineGame(
  fetchImpl: typeof fetch,
  input: { level: string; color: 'white' | 'black' | 'random' },
): Promise<CommandOutcome<GameView>> {
  return postCommand<GameView>(fetchImpl, '/api/engine-games', input)
}

/** `GET /api/engine-levels`: the computer's levels, weakest first. */
export async function loadEngineLevels(fetchImpl: typeof fetch): Promise<Array<EngineLevel>> {
  const body = await readJson<{ levels: Array<EngineLevel> }>(
    await fetchImpl('/api/engine-levels'),
    'GET /api/engine-levels',
  )
  return body.levels
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
export function downloadPgn(
  request: Request,
  id: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  if (!isGuid(id)) return Promise.resolve(new Response('Not a game id.', { status: 400 }))
  return pgnDownload(
    request,
    `/api/games/${id}/pgn`,
    `/games/${id}`,
    `chess-${id.replaceAll('-', '')}.pgn`,
    fetchImpl,
    env,
  )
}
