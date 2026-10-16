import { postCommand, readJson } from './upstream'
import type { CommandOutcome } from '@chess/core'
import type { CursorPage } from '../play'
import type {
  BroadcastRun,
  ImportAnswer,
  ImportBatch,
  LibraryGameItem,
  LibraryGameView,
  LibraryPosition,
  LibrarySource,
  OpeningView,
} from '../library'

/** `GET /api/library/games?…` with a query built by `lib/library.ts#searchQuery`. */
export async function loadLibrary(
  fetchImpl: typeof fetch,
  query: string,
): Promise<CursorPage<LibraryGameItem>> {
  return readJson<CursorPage<LibraryGameItem>>(
    await fetchImpl(`/api/library/games?${query}`),
    'GET /api/library/games',
  )
}

/** `GET /api/library/games/{id}`: null for an unknown game. */
export async function loadLibraryGame(
  fetchImpl: typeof fetch,
  id: string,
): Promise<LibraryGameView | null> {
  const res = await fetchImpl(`/api/library/games/${id}`)
  if (res.status === 404) return null
  return readJson<LibraryGameView>(res, `GET /api/library/games/${id}`)
}

/** `GET /api/library/positions?key=&source=`: the library games at a position and how they ended. */
export async function loadPosition(
  fetchImpl: typeof fetch,
  key: string,
  source: LibrarySource = 'all',
): Promise<LibraryPosition> {
  const only = source === 'all' ? '' : `&source=${source}`
  return readJson<LibraryPosition>(
    await fetchImpl(`/api/library/positions?key=${encodeURIComponent(key)}${only}`),
    'GET /api/library/positions',
  )
}

/** `GET /api/library/openings?key=`: the position's opening name, or null when it has none. */
export async function loadOpening(
  fetchImpl: typeof fetch,
  key: string,
): Promise<OpeningView | null> {
  const res = await fetchImpl(`/api/library/openings?key=${encodeURIComponent(key)}`)
  if (res.status === 404) return null
  return readJson<OpeningView>(res, 'GET /api/library/openings')
}

/** `POST /api/admin/library/import` (Admin): every game's outcome; a refusal (403, 400) is an outcome. */
export function importLibrary(
  fetchImpl: typeof fetch,
  batch: ImportBatch,
): Promise<CommandOutcome<ImportAnswer>> {
  return postCommand<ImportAnswer>(fetchImpl, '/api/admin/library/import', batch)
}

/** `GET /api/admin/library/broadcasts` (Admin): the latest month imports, newest first. */
export async function loadBroadcastRuns(fetchImpl: typeof fetch): Promise<Array<BroadcastRun>> {
  return readJson<Array<BroadcastRun>>(
    await fetchImpl('/api/admin/library/broadcasts'),
    'GET /api/admin/library/broadcasts',
  )
}

/** `POST /api/admin/library/broadcasts` (Admin): start a month; a refusal (another month running: 409) is an outcome. */
export function startBroadcastImport(
  fetchImpl: typeof fetch,
  month: string,
): Promise<CommandOutcome<{ runId: string }>> {
  return postCommand<{ runId: string }>(fetchImpl, '/api/admin/library/broadcasts', { month })
}
