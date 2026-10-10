import { postCommand, readJson } from './upstream'
import type { CommandOutcome } from '../games'
import type {
  TrainingFilters,
  TrainingMode,
  TrainingNext,
  TrainingSummary,
  TrainingVerdict,
} from '../training'

/** The query of `GET /api/training/next`: filters only for master games, `exclude` as one comma list. */
export function trainingQuery(
  mode: TrainingMode,
  filters: TrainingFilters,
  exclude: ReadonlyArray<string>,
): string {
  const query = new URLSearchParams({ mode })
  if (mode === 'library') {
    if (filters.opening) query.set('eco', filters.opening)
    if (filters.phase) query.set('phase', filters.phase)
    if (filters.player) query.set('player', filters.player)
    if (filters.from) query.set('from', String(filters.from))
    if (filters.to) query.set('to', String(filters.to))
  }
  if (exclude.length > 0) query.set('exclude', exclude.join(','))
  return query.toString()
}

/** `GET /api/training/next?…`: the next position of the session (null when none is left) and the pool's size. */
export async function loadTrainingNext(
  fetchImpl: typeof fetch,
  request: { mode: TrainingMode; filters: TrainingFilters; exclude: ReadonlyArray<string> },
): Promise<TrainingNext> {
  return readJson<TrainingNext>(
    await fetchImpl(
      `/api/training/next?${trainingQuery(request.mode, request.filters, request.exclude)}`,
    ),
    'GET /api/training/next',
  )
}

/** `POST /api/training/answer`: the server judges the move; a refusal (400, 404) is an outcome. */
export function answerTraining(
  fetchImpl: typeof fetch,
  answer: { mode: TrainingMode; id: string; uci: string },
): Promise<CommandOutcome<TrainingVerdict>> {
  return postCommand<TrainingVerdict>(fetchImpl, '/api/training/answer', answer)
}

/** `GET /api/training/summary`: the member's own counts, for the start panel and their profile. */
export async function loadTrainingSummary(fetchImpl: typeof fetch): Promise<TrainingSummary> {
  return readJson<TrainingSummary>(
    await fetchImpl('/api/training/summary'),
    'GET /api/training/summary',
  )
}
