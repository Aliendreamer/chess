import { isGuid, pgnDownload, readJson, sendCommand } from './upstream'
import type { CommandOutcome } from '../games'
import type { CursorPage } from '../play'
import type { AnalysisView, Think } from '../analysis'
import type { ImportResult, StudyInput, StudyListItem, StudyMoveInput, StudyView } from '../studies'

/** `POST /api/studies`: one study or an import of up to 20; the server replays every line (studies D2). */
export function createStudies(
  fetchImpl: typeof fetch,
  studies: ReadonlyArray<StudyInput>,
): Promise<CommandOutcome<ImportResult>> {
  return sendCommand<ImportResult>(fetchImpl, 'POST', '/api/studies', { studies })
}

/** `GET /api/studies`: mine, newest first. */
export async function loadMyStudies(
  fetchImpl: typeof fetch,
  page: { limit: number; cursor?: string | undefined },
): Promise<CursorPage<StudyListItem>> {
  const query = new URLSearchParams({ limit: String(page.limit) })
  if (page.cursor) query.set('cursor', page.cursor)
  return readJson<CursorPage<StudyListItem>>(
    await fetchImpl(`/api/studies?${query.toString()}`),
    'GET /api/studies',
  )
}

/** `GET /api/studies/{id}`: null when there is no such study for me (a private one that is not mine is the same). */
export async function loadStudy(fetchImpl: typeof fetch, id: string): Promise<StudyView | null> {
  const res = await fetchImpl(`/api/studies/${id}`)
  if (res.status === 404 || res.status === 400) return null
  return readJson<StudyView>(res, `GET /api/studies/${id}`)
}

/** `PUT /api/studies/{id}`: over the version I opened; a newer save elsewhere is a 409 outcome. */
export function saveStudy(
  fetchImpl: typeof fetch,
  input: { id: string; title: string; tree: ReadonlyArray<StudyMoveInput>; version: number },
): Promise<CommandOutcome<StudyView>> {
  return sendCommand<StudyView>(fetchImpl, 'PUT', `/api/studies/${input.id}`, {
    title: input.title,
    tree: input.tree,
    version: input.version,
  })
}

export function shareStudy(
  fetchImpl: typeof fetch,
  id: string,
  shared: boolean,
): Promise<CommandOutcome<StudyView>> {
  return sendCommand<StudyView>(fetchImpl, 'POST', `/api/studies/${id}/share`, { shared })
}

export function deleteStudy(fetchImpl: typeof fetch, id: string): Promise<CommandOutcome<null>> {
  return sendCommand<null>(fetchImpl, 'DELETE', `/api/studies/${id}`)
}

/** `POST /api/games/{id}/study`: a finished game as a new study of mine (studies D5). */
export function studyFromGame(
  fetchImpl: typeof fetch,
  gameId: string,
): Promise<CommandOutcome<StudyView>> {
  return sendCommand<StudyView>(fetchImpl, 'POST', `/api/games/${gameId}/study`)
}

/** `GET /pgn/study/{id}` on the app origin: the study as a `.pgn` file. */
export function downloadStudyPgn(
  request: Request,
  id: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  if (!isGuid(id)) return Promise.resolve(new Response('Not a study id.', { status: 400 }))
  return pgnDownload(
    request,
    `/api/studies/${id}/pgn`,
    `/studies/${id}`,
    `study-${id.replaceAll('-', '')}.pgn`,
    fetchImpl,
    env,
  )
}

/** `POST /api/analysis`: the position with its evaluation when known; otherwise the engine is asked (engine-analysis D2). */
export function analysePosition(
  fetchImpl: typeof fetch,
  input: { fen: string; think: Think },
): Promise<CommandOutcome<AnalysisView>> {
  return sendCommand<AnalysisView>(fetchImpl, 'POST', '/api/analysis', input)
}
