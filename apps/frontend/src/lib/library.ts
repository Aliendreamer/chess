import { useEffect, useRef, useState } from 'react'
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

/** A game's moves as a one-line tree, to replay with `fromInput` (a library game opened on the analysis board). */
export function uciLine(moves: ReadonlyArray<string>): Array<StudyMoveInput> {
  return moves.reduceRight<Array<StudyMoveInput>>((children, uci) => [{ uci, children }], [])
}

/**
 * The opening of the position at the end of `keys` (the line's positions, start excluded): the deepest named one,
 * walking back from the end. Each position is asked once and remembered for the page's life.
 */
export function useOpeningName(
  keys: ReadonlyArray<string>,
  load: (key: string) => Promise<OpeningView | null>,
): OpeningView | null {
  const known = useRef(new Map<string, OpeningView | null>())
  const [name, setName] = useState<OpeningView | null>(null)
  const line = keys.join('|')
  useEffect(() => {
    // An object, so the check after an await is not narrowed away: the cleanup flips it while the walk waits.
    const run = { live: true }
    void (async () => {
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i]!
        if (!known.current.has(key)) {
          known.current.set(key, await load(key).catch(() => null))
          if (!run.live) return
        }
        const found = known.current.get(key)
        if (found) {
          setName(found)
          return
        }
      }
      if (run.live) setName(null)
    })()
    return () => {
      run.live = false
    }
  }, [line])
  return name
}

/** The library games at the position on the board, asked once per position. */
export function useLibraryPosition(
  key: string,
  load: (key: string) => Promise<LibraryPosition>,
): LibraryPosition | null {
  const known = useRef(new Map<string, LibraryPosition>())
  const [position, setPosition] = useState<LibraryPosition | null>(known.current.get(key) ?? null)
  useEffect(() => {
    let live = true
    const cached = known.current.get(key)
    if (cached) {
      setPosition(cached)
      return
    }
    setPosition(null)
    load(key)
      .then((answer) => {
        known.current.set(key, answer)
        if (live) setPosition(answer)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key])
  return position
}
