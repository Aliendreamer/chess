import { postCommand, readJson } from './upstream'
import type { CommandOutcome } from '../games'
import type { ReviewView } from '../review'

/** `GET /api/games/{id}/review`: null for an unknown game. */
export async function loadReview(fetchImpl: typeof fetch, id: string): Promise<ReviewView | null> {
  const res = await fetchImpl(`/api/games/${id}/review`)
  if (res.status === 404) return null
  return readJson<ReviewView>(res, `GET /api/games/${id}/review`)
}

/** `POST /api/games/{id}/review`: a player of a finished game; a refusal (403, 409) is an outcome. */
export function startReview(
  fetchImpl: typeof fetch,
  id: string,
): Promise<CommandOutcome<ReviewView>> {
  return postCommand<ReviewView>(fetchImpl, `/api/games/${id}/review`)
}
