import { Chess } from 'chess.js'
import { positionKey } from './analysis.ts'
import { sha256 } from './trainer.ts'
import { STANDARD_START } from './tree.ts'
import type { Opening } from './trainer.ts'
import type { ParsedGame, StudyMoveInput } from './tree.ts'

/**
 * The game library's import rules (game-library D3–D4), pure: a game from PGN as the import takes it, the checks and
 * replay that make it a library game with every position it reached, its dedupe key, and the openings list (lichess
 * `chess-openings`, CC0) read from its TSV. Ported from the backend's `Library/LibraryImport` and `OpeningSeed`.
 */

/** One game as an import takes it: factual headers and the main line in UCI. */
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

/** A tree's main line: each node's first child. */
export function mainLine(tree: ReadonlyArray<StudyMoveInput>): Array<string> {
  const moves: Array<string> = []
  for (let node = tree[0]; node; node = node.children[0]) moves.push(node.uci)
  return moves
}

/** A game's moves as a one-line tree, to replay with `fromInput` (a library game opened on the analysis board). */
export function uciLine(moves: ReadonlyArray<string>): Array<StudyMoveInput> {
  return moves.reduceRight<Array<StudyMoveInput>>((children, uci) => [{ uci, children }], [])
}

/** A parsed game as the import takes it; the import judges it (a FEN start is refused there, not here). */
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

/** Where a batch of games came from and under which terms; every game of the batch carries it. */
export interface ImportSource {
  source: string
  licence: string
  sourceRef: string | null
}

/** A library game as stored. */
export interface LibraryGame {
  id: string
  white: string
  black: string
  event: string | null
  site: string | null
  round: string | null
  dateText: string | null
  year: number | null
  result: string
  eco: string | null
  openingName: string | null
  movesUci: Array<string>
  ply: number
  source: string
  licence: string
  sourceRef: string | null
  dedupeKey: string
}

/** A position a library game reached, with the move played from it (null after the last move). */
export interface LibraryGamePosition {
  positionKey: string
  gameId: string
  ply: number
  nextUci: string | null
  result: string
  source: string
}

export type PreparedImport =
  | { ok: true; game: LibraryGame; positions: Array<LibraryGamePosition> }
  | { ok: false; error: string }

const RESULTS = ['1-0', '0-1', '1/2-1/2', '*']

/**
 * A game made ready to store: it starts from the standard position, every move replays with no automatic draws (a
 * repetition or fifty moves end a real game only when claimed), its positions are keyed like the analysis cache, and its
 * opening is the deepest named position it reaches unless the PGN names its own ECO. `id` is the new game's id.
 */
export function prepareImport(
  game: ImportGame,
  source: ImportSource,
  openings: ReadonlyMap<string, Pick<Opening, 'eco' | 'name'>>,
  id: string,
): PreparedImport {
  if (unnamed(game.white) || unnamed(game.black))
    return { ok: false, error: 'Both players must be named.' }
  if (game.startFen && game.startFen.trim() !== '')
    return {
      ok: false,
      error: 'A library game starts from the standard position (this one has a FEN).',
    }
  if (game.moves.length === 0) return { ok: false, error: 'The game has no moves.' }
  if (!RESULTS.includes(game.result)) return { ok: false, error: `Unknown result: ${game.result}.` }

  const board = new Chess(STANDARD_START)
  const at = (ply: number): LibraryGamePosition => ({
    positionKey: positionKey(board.fen()),
    gameId: id,
    ply,
    nextUci: game.moves[ply] ?? null,
    result: game.result,
    source: source.source,
  })
  const positions = [at(0)]
  let opening: Pick<Opening, 'eco' | 'name'> | null = null
  for (const [i, uci] of game.moves.entries()) {
    try {
      board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] } : {}),
      })
    } catch (e) {
      return {
        ok: false,
        error: `Illegal move ${i + 1} (${uci}): ${e instanceof Error ? e.message : 'not legal'}`,
      }
    }
    const position = at(i + 1)
    positions.push(position)
    opening = openings.get(position.positionKey) ?? opening
  }

  const year = yearOf(game.date)
  return {
    ok: true,
    game: {
      id,
      white: game.white.trim(),
      black: game.black.trim(),
      event: clean(game.event),
      site: clean(game.site),
      round: clean(game.round),
      dateText: clean(game.date),
      year,
      result: game.result,
      eco: clean(game.eco) ?? opening?.eco ?? null,
      openingName: opening?.name ?? null,
      movesUci: [...game.moves],
      ply: game.moves.length,
      source: source.source,
      licence: source.licence,
      sourceRef: source.sourceRef,
      dedupeKey: dedupeKey(game.white, game.black, year, game.moves),
    },
    positions,
  }
}

/** The year of a PGN date (`1886.??.??` → 1886); null when it has none. */
export function yearOf(date: string | null | undefined): number | null {
  return date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null
}

/** Players without case or extra spaces, the year, and a hash of the moves: one key per game. */
export function dedupeKey(
  white: string,
  black: string,
  year: number | null,
  moves: ReadonlyArray<string>,
): string {
  const hash = [...sha256(new TextEncoder().encode(moves.join(' ')))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
  return `${normalise(white)}|${normalise(black)}|${year ?? ''}|${hash}`
}

const normalise = (name: string) => name.split(' ').filter(Boolean).join(' ').toLowerCase()

/** No name, or PGN's "?" for an unknown player: a famous game names both. */
const unnamed = (name: string | null | undefined) => !name || /^\?*$/.test(name.trim())

const clean = (value: string | null | undefined) =>
  !value || value.trim() === '' || value.trim() === '?' ? null : value.trim()

/** One row of the openings list replayed from the start; null when a move does not replay (skipped, not trusted). */
export function parseOpening(eco: string, name: string, pgn: string): Opening | null {
  const board = new Chess(STANDARD_START)
  const movesUci: Array<string> = []
  for (const token of pgn.split(' ').filter(Boolean)) {
    if (token.endsWith('.')) continue // a move number: "1." or "3..."
    try {
      const m = board.move(token)
      movesUci.push(`${m.from}${m.to}${m.promotion ?? ''}`)
    } catch {
      return null
    }
  }
  return movesUci.length > 0 ? { key: positionKey(board.fen()), eco, name, movesUci } : null
}

/** Every row of the list's TSV files (header `eco name pgn`) that replays, one per position: the first name given. */
export function readOpenings(files: Iterable<string>): Array<Opening> {
  const seen = new Set<string>()
  const out: Array<Opening> = []
  for (const text of files) {
    for (const row of text.split(/\r?\n/).slice(1)) {
      const cells = row.split('\t')
      if (cells.length !== 3) continue
      const opening = parseOpening(cells[0]!, cells[1]!, cells[2]!)
      if (opening && !seen.has(opening.key)) {
        seen.add(opening.key)
        out.push(opening)
      }
    }
  }
  return out
}
