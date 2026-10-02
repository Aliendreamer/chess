import { postCommand, readJson } from './upstream'
import type { CommandOutcome } from '../games'
import type { CursorPage } from '../play'
import type {
  ImportAnswer,
  ImportBatch,
  LibraryGameItem,
  LibraryGameView,
  LibraryPosition,
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

/** `GET /api/library/positions?key=`: the library games at a position and how they ended. */
export async function loadPosition(fetchImpl: typeof fetch, key: string): Promise<LibraryPosition> {
  return readJson<LibraryPosition>(
    await fetchImpl(`/api/library/positions?key=${encodeURIComponent(key)}`),
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
