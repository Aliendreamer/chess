import { STANDARD_START } from './studies'
import type { ParsedGame, StudyMoveInput } from './studies'

/**
 * The game library (game-library): its API shapes, search query, and turning a parsed PGN game into what the admin
 * import sends. Client-safe; the reads are in `lib/server/library.ts`.
 */

export interface LibraryGameItem {
  id: string
  white: string
  black: string
  event: string | null
  site: string | null
  round: string | null
  date: string | null
  year: number | null
  result: string
  eco: string | null
  opening: string | null
  worldChampionship: boolean
  ply: number
  source: string
  licence: string
}

export interface LibraryGameView {
  game: LibraryGameItem
  moves: Array<string>
  sourceRef: string | null
}

export interface PositionGame {
  id: string
  white: string
  black: string
  year: number | null
  event: string | null
  result: string
  ply: number
}

export interface LibraryPosition {
  games: number
  whiteWins: number
  draws: number
  blackWins: number
  items: Array<PositionGame>
}

export interface OpeningView {
  eco: string
  name: string
}

export interface LibrarySearch {
  player?: string
  event?: string
  from?: number
  to?: number
  result?: '1-0' | '0-1' | '1/2-1/2'
  wc?: boolean
  eco?: string
  opening?: string
}

/** One game as the admin import sends it: factual headers and the main line in UCI. */
export interface ImportGame {
  white: string
  black: string
  event: string | null
  site: string | null
  round: string | null
  date: string | null
  result: string
  eco: string | null
  moves: Array<string>
  startFen: string | null
}

export interface ImportItem {
  index: number
  status: 'imported' | 'duplicate' | 'refused'
  error?: string | null
  gameId?: string | null
}

export interface ImportAnswer {
  imported: number
  duplicates: number
  refused: number
  items: Array<ImportItem>
}

export interface ImportBatch {
  source: string
  licence: string
  sourceRef: string | null
  worldChampionship: boolean
  games: Array<ImportGame>
}

/** The most games one import request carries (the API's limit). */
export const IMPORT_BATCH = 100

const SEARCH_KEYS = ['player', 'event', 'from', 'to', 'result', 'wc', 'eco', 'opening'] as const

/** `limit`, then only the filters that are set, then the cursor. */
export function searchQuery(search: LibrarySearch, limit: number, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(limit) })
  for (const key of SEARCH_KEYS) {
    const value = search[key]
    if (
      value === undefined ||
      value === false ||
      (typeof value === 'string' && value.trim() === '')
    )
      continue
    query.set(key, typeof value === 'string' ? value.trim() : String(value))
  }
  if (cursor) query.set('cursor', cursor)
  return query.toString()
}

/** A tree's main line: each node's first child. */
export function mainLine(tree: ReadonlyArray<StudyMoveInput>): Array<string> {
  const moves: Array<string> = []
  for (let node = tree[0]; node; node = node.children[0]) moves.push(node.uci)
  return moves
}

/** A parsed game as the import sends it; the server judges it (a FEN start is refused there, not here). */
export function toImportGame(parsed: ParsedGame & { ok: true }): ImportGame {
  const { study, headers } = parsed
  const startFen = study.startFen && study.startFen !== STANDARD_START ? study.startFen : null
  return {
    white: study.white ?? '?',
    black: study.black ?? '?',
    event: headers.event,
    site: headers.site,
    round: headers.round,
    date: headers.date,
    result: study.result ?? '*',
    eco: headers.eco,
    moves: mainLine(study.tree),
    startFen,
  }
}

export function batches<T>(items: ReadonlyArray<T>, size: number): Array<Array<T>> {
  const out: Array<Array<T>> = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
