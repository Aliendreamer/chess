import { useCallback, useEffect, useRef, useState } from 'react'
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
  /** Where it came from, e.g. "lichess broadcasts". */
  source: string
  /** The source's own link: a broadcast game's lichess page (its attribution). */
  sourceRef: string | null
}

/** Which games the library counts (broadcast-explorer D8): every one, the curated ones, or lichess broadcasts. */
export type LibrarySource = 'all' | 'wc' | 'broadcasts'

export const LIBRARY_SOURCES: ReadonlyArray<{ value: LibrarySource; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'wc', label: 'World Championships' },
  { value: 'broadcasts', label: 'Broadcasts' },
]

export function isLibrarySource(value: unknown): value is LibrarySource {
  return value === 'all' || value === 'wc' || value === 'broadcasts'
}

/** The `source` the API stores on a broadcast game. */
export const BROADCAST_SOURCE = 'lichess broadcasts'

/** A broadcast game's lichess page, only when it is an https URL on lichess.org (the link is rendered); else null. */
export function lichessUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'lichess.org' ? url.href : null
  } catch {
    return null
  }
}

/** Broadcast games are indexed for their opening only: this many moves (40 plies). */
export const BROADCAST_POSITION_MOVES = 20

export interface Credit {
  label: string
  href: string
}

const CREDITS: Record<Exclude<LibrarySource, 'all'>, Credit> = {
  wc: { label: 'World Championships from PGN Mentor', href: 'https://www.pgnmentor.com/' },
  broadcasts: {
    label: 'Lichess broadcasts, CC BY-SA 4.0',
    href: 'https://database.lichess.org/#broadcasts',
  },
}

/** One credit line per source the choice counts: what the broadcasts' licence asks for. */
export function creditsFor(source: LibrarySource): Array<Credit> {
  return source === 'all' ? [CREDITS.wc, CREDITS.broadcasts] : [CREDITS[source]]
}

/** The months lichess has published, newest first: from 2020-01 up to last month (a month is published once over). */
export function publishedMonths(now: Date): Array<string> {
  const months: Array<string> = []
  // getUTCMonth is 0-based, so it is last month counted from 1; January's last month is December of last year.
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth()
  if (month === 0) [year, month] = [year - 1, 12]
  while (year >= 2020) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month -= 1
    if (month === 0) [year, month] = [year - 1, 12]
  }
  return months
}

/** One month's import (broadcast-explorer D1), as the admin's runs list shows it. */
export interface BroadcastRun {
  id: string
  month: string
  state: 'running' | 'finished' | 'failed'
  read: number
  kept: number
  imported: number
  duplicate: number
  refused: number
  error: string | null
  startedAt: string
  finishedAt: string | null
}

/** A move played from the position in the library's games (library-explorer). */
export interface ExplorerMove {
  uci: string
  games: number
  whiteWins: number
  draws: number
  blackWins: number
  eco: string | null
  opening: string | null
}

export interface LibraryPosition {
  games: number
  whiteWins: number
  draws: number
  blackWins: number
  items: Array<PositionGame>
  /** Most played first. */
  moves: Array<ExplorerMove>
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
  source?: LibrarySource
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

const SEARCH_KEYS = [
  'player',
  'event',
  'from',
  'to',
  'result',
  'wc',
  'eco',
  'opening',
  'source',
] as const

/** `limit`, then only the filters that are set, then the cursor. */
export function searchQuery(search: LibrarySearch, limit: number, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(limit) })
  for (const key of SEARCH_KEYS) {
    const value = search[key]
    if (
      value === undefined ||
      value === false ||
      (key === 'source' && value === 'all') ||
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

/** The library games at the position on the board, asked once per position and source. */
export function useLibraryPosition(
  key: string,
  source: LibrarySource,
  load: (key: string, source: LibrarySource) => Promise<LibraryPosition>,
): LibraryPosition | null {
  const known = useRef(new Map<string, LibraryPosition>())
  const id = `${source}|${key}`
  const [position, setPosition] = useState<LibraryPosition | null>(known.current.get(id) ?? null)
  useEffect(() => {
    let live = true
    const cached = known.current.get(id)
    if (cached) {
      setPosition(cached)
      return
    }
    setPosition(null)
    load(key, source)
      .then((answer) => {
        known.current.set(id, answer)
        if (live) setPosition(answer)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id])
  return position
}

/**
 * The admin's broadcast runs (broadcast-explorer D1): polled every `everyMs` while one is running, so its counts move;
 * `refresh` after starting one.
 */
export function useBroadcastRuns(
  initial: ReadonlyArray<BroadcastRun>,
  load: () => Promise<Array<BroadcastRun>>,
  everyMs = 2000,
): { runs: ReadonlyArray<BroadcastRun>; refresh: () => Promise<void> } {
  const [runs, setRuns] = useState<ReadonlyArray<BroadcastRun>>(initial)
  const refresh = useCallback(async () => {
    setRuns(await load())
  }, [load])
  const running = runs.some((r) => r.state === 'running')
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void refresh().catch(() => undefined), everyMs)
    return () => clearInterval(timer)
  }, [running, refresh, everyMs])
  return { runs, refresh }
}
