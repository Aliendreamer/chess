import { postCommand, readJson } from './upstream'
import type { CommandOutcome } from '../games'
import type { PracticeNext, PracticeResult, PracticeSummary, ReviewView } from '../review'

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

/** `POST /api/games/{id}/review/practice`: the caller's mistakes into their practice. */
export function practiseGame(
  fetchImpl: typeof fetch,
  id: string,
): Promise<CommandOutcome<{ added: number }>> {
  return postCommand<{ added: number }>(fetchImpl, `/api/games/${id}/review/practice`)
}

/** `GET /api/practice/next`: the position due now, or when the next is. */
export async function loadPracticeNext(fetchImpl: typeof fetch): Promise<PracticeNext> {
  return readJson<PracticeNext>(await fetchImpl('/api/practice/next'), 'GET /api/practice/next')
}

/** `POST /api/practice/results`: one answer. */
export function recordPractice(
  fetchImpl: typeof fetch,
  answer: { gameId: string; ply: number; correct: boolean },
): Promise<CommandOutcome<PracticeResult>> {
  return postCommand<PracticeResult>(fetchImpl, '/api/practice/results', answer)
}

/** `GET /api/me/practice`: positions, learned, due now. */
export async function loadMyPractice(fetchImpl: typeof fetch): Promise<PracticeSummary> {
  return readJson<PracticeSummary>(await fetchImpl('/api/me/practice'), 'GET /api/me/practice')
}
