import { postCommand, readJson } from './upstream'
import type { CommandOutcome } from '../games'
import type {
  FamilyProgress,
  NextLine,
  RunResult,
  TrainedFamily,
  TrainerColor,
  TrainerLine,
} from '../trainer'

/** `GET /api/trainer/families?q=&color=`: every family (or those matching), with the member's progress. */
export async function loadFamilies(
  fetchImpl: typeof fetch,
  color: TrainerColor,
  q?: string,
): Promise<Array<FamilyProgress>> {
  const query = new URLSearchParams({ color })
  if (q) query.set('q', q)
  return readJson<Array<FamilyProgress>>(
    await fetchImpl(`/api/trainer/families?${query.toString()}`),
    'GET /api/trainer/families',
  )
}

function familyQuery(name: string, color: TrainerColor): string {
  return new URLSearchParams({ name, color }).toString()
}

/** `GET /api/trainer/family?name=&color=`: the family's lines with their state; null for an unknown family. */
export async function loadFamily(
  fetchImpl: typeof fetch,
  name: string,
  color: TrainerColor,
): Promise<Array<TrainerLine> | null> {
  const res = await fetchImpl(`/api/trainer/family?${familyQuery(name, color)}`)
  if (res.status === 404) return null
  return readJson<Array<TrainerLine>>(res, 'GET /api/trainer/family')
}

/** `GET /api/trainer/next?name=&color=`: the line to drill next; null for an unknown family. */
export async function loadNextLine(
  fetchImpl: typeof fetch,
  name: string,
  color: TrainerColor,
): Promise<NextLine | null> {
  const res = await fetchImpl(`/api/trainer/next?${familyQuery(name, color)}`)
  if (res.status === 404) return null
  return readJson<NextLine>(res, 'GET /api/trainer/next')
}

/** `POST /api/trainer/results`: one run through a line. */
export function recordRun(
  fetchImpl: typeof fetch,
  run: { lineKey: string; color: TrainerColor; mistakes: number },
): Promise<CommandOutcome<RunResult>> {
  return postCommand<RunResult>(fetchImpl, '/api/trainer/results', run)
}

/** `GET /api/me/trainer`: the families the member has trained (their own profile only). */
export async function loadMyTraining(fetchImpl: typeof fetch): Promise<Array<TrainedFamily>> {
  return readJson<Array<TrainedFamily>>(await fetchImpl('/api/me/trainer'), 'GET /api/me/trainer')
}
