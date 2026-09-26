import { redirect } from '@tanstack/react-router'
import type { GameSummary, GameView, MoveItem } from '../games'

const LOGIN_REDIRECT = '/api/auth/login?returnTo=/'

/** What a command answers (D8): refusals (403/404/409/422) are shown in the page, not thrown. */
export type CommandOutcome<T> = { ok: true; view: T } | { ok: false; status: number; error: string }

export type GameCommand =
  | { kind: 'move'; uci: string }
  | { kind: 'resign' | 'draw-offer' | 'draw-accept' | 'draw-decline' | 'abort' }

const COMMAND_PATH: Record<GameCommand['kind'], string> = {
  move: 'moves',
  resign: 'resign',
  'draw-offer': 'draw/offer',
  'draw-accept': 'draw/accept',
  'draw-decline': 'draw/decline',
  abort: 'abort',
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

async function readJson<T>(res: Response, what: string): Promise<T> {
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (!res.ok) throw new Error(`${what} failed with ${res.status}`)
  return (await res.json()) as T
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

export function sendGameCommand(
  fetchImpl: typeof fetch,
  id: string,
  command: GameCommand,
): Promise<CommandOutcome<GameView>> {
  const path = `/api/games/${id}/${COMMAND_PATH[command.kind]}`
  return postCommand<GameView>(
    fetchImpl,
    path,
    command.kind === 'move' ? { uci: command.uci } : undefined,
  )
}
