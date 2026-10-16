import { parseGame, split } from '@mliebelt/pgn-parser'
import { Chess, validateFen } from 'chess.js'
import type { ParseTree } from '@mliebelt/pgn-parser'

/**
 * The move tree of a study or an analysis (studies D1–D3), the operations a board performs on it, and PGN import.
 * Pure. In the club the tree the page edits is only a draft: the server replays it and answers with its own SAN/FEN.
 */
/** A move as the PGN parser gives it (its own types package is not a direct dependency). */
type PgnMove = ParseTree['moves'][number]

export const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A move in a study, as the API answers it: a node's first child continues its line, the others are variations. */
export interface StudyMove {
  uci: string
  san: string
  fen: string
  children: Array<StudyMove>
}

/** A move as the API takes it: UCI only. */
export interface StudyMoveInput {
  uci: string
  children: Array<StudyMoveInput>
}

export interface StudyInput {
  title: string
  startFen?: string | null
  tree: Array<StudyMoveInput>
  white?: string | null
  black?: string | null
  result?: string | null
  date?: string | null
}

/** A position in the tree: child indexes from the top; `[]` is the start position. */
export type TreePath = ReadonlyArray<number>

/** The move at `path`, or null at the start or off the tree. */
export function nodeAt(tree: ReadonlyArray<StudyMove>, path: TreePath): StudyMove | null {
  let level = tree
  let node: StudyMove | null = null
  for (const i of path) {
    node = level[i] ?? null
    if (!node) return null
    level = node.children
  }
  return node
}

/** The moves that may follow `path`. */
export function childrenAt(
  tree: ReadonlyArray<StudyMove>,
  path: TreePath,
): ReadonlyArray<StudyMove> {
  return path.length === 0 ? tree : (nodeAt(tree, path)?.children ?? [])
}

/** The position at `path`. */
export function fenAt(startFen: string, tree: ReadonlyArray<StudyMove>, path: TreePath): string {
  return path.length === 0 ? startFen : (nodeAt(tree, path)?.fen ?? startFen)
}

/** One step forward along the line (the first continuation), or null at its end. */
export function nextPath(tree: ReadonlyArray<StudyMove>, path: TreePath): TreePath | null {
  return childrenAt(tree, path).length > 0 ? [...path, 0] : null
}

/** The end of the line through `path` (following first continuations). */
export function lineEnd(tree: ReadonlyArray<StudyMove>, path: TreePath): TreePath {
  let end = path
  for (let next = nextPath(tree, end); next; next = nextPath(tree, next)) end = next
  return end
}

/**
 * Plays `move` after `path`: an existing child with the same UCI is followed, otherwise the move is added as a new
 * line (the main line when there was none). Returns the new tree and the path to the move.
 */
export function addMove(
  tree: ReadonlyArray<StudyMove>,
  path: TreePath,
  move: StudyMove,
): { tree: Array<StudyMove>; path: TreePath } {
  const existing = childrenAt(tree, path).findIndex((c) => c.uci === move.uci)
  if (existing >= 0) return { tree: [...tree], path: [...path, existing] }
  const next = updateChildren(tree, path, (children) => [...children, { ...move, children: [] }])
  return { tree: next, path: [...path, childrenAt(next, path).length - 1] }
}

/** Makes the move at `path` the first of its siblings: its line becomes the one continued. */
export function promote(tree: ReadonlyArray<StudyMove>, path: TreePath): Array<StudyMove> {
  const index = path.at(-1)
  if (index === undefined || index === 0) return [...tree]
  return updateChildren(tree, path.slice(0, -1), (children) => [
    children[index]!,
    ...children.filter((_, i) => i !== index),
  ])
}

/** Deletes the move at `path` and everything after it. */
export function remove(tree: ReadonlyArray<StudyMove>, path: TreePath): Array<StudyMove> {
  const index = path.at(-1)
  if (index === undefined) return [...tree]
  return updateChildren(tree, path.slice(0, -1), (children) =>
    children.filter((_, i) => i !== index),
  )
}

/** The tree as the API takes it. */
export function toInput(tree: ReadonlyArray<StudyMove>): Array<StudyMoveInput> {
  return tree.map((m) => ({ uci: m.uci, children: toInput(m.children) }))
}

function updateChildren(
  tree: ReadonlyArray<StudyMove>,
  path: TreePath,
  change: (children: ReadonlyArray<StudyMove>) => Array<StudyMove>,
): Array<StudyMove> {
  if (path.length === 0) return change(tree)
  const [head, ...rest] = path
  return tree.map((m, i) =>
    i === head ? { ...m, children: updateChildren(m.children, rest, change) } : m,
  )
}

/** One game of an import: ready to send, or why it could not be read. */
export type ParsedGame =
  | { ok: true; study: StudyInput; headers: PgnHeaders }
  | { ok: false; error: string }

/** The factual headers a library import keeps (game-library); a partial date stays partial (`1886.??.??`). */
export interface PgnHeaders {
  event: string | null
  site: string | null
  round: string | null
  date: string | null
  eco: string | null
}

/**
 * PGN text → one study per game (studies D3): each game is split out and parsed on its own, so a broken game is
 * reported and the others still import. SAN becomes UCI by playing it with chess.js from the game's start (the FEN
 * tag, or the standard start). Comments, NAGs and clocks are dropped.
 */
export function parsePgn(text: string): Array<ParsedGame> {
  return split(normalisePgn(text), { startRule: 'games' }).map((part, n) => {
    try {
      const game = parseGame(part.all, { startRule: 'game' })
      const tags = (game.tags ?? {}) as Record<string, unknown>
      const startFen = typeof tags.FEN === 'string' ? tags.FEN : STANDARD_START
      // Most tags are strings; the parser gives Date as { value, year, month, day }.
      const tag = (name: string): string | null => {
        const raw = tags[name]
        const value =
          typeof raw === 'object' && raw !== null && 'value' in raw
            ? String(raw.value)
            : typeof raw === 'string'
              ? raw
              : null
        return value && !value.includes('?') ? value : null
      }
      // A header kept as written unless it is wholly unknown ("?", "????.??.??").
      const raw = (name: string): string | null => {
        const value = tags[name]
        const written =
          typeof value === 'object' && value !== null && 'value' in value
            ? String(value.value)
            : typeof value === 'string'
              ? value
              : null
        return written && /[^?.\s]/.test(written) ? written : null
      }
      const white = tag('White')
      const black = tag('Black')
      const event = tag('Event')
      return {
        ok: true as const,
        study: {
          title: event ?? (white && black ? `${white} – ${black}` : `Imported game ${n + 1}`),
          startFen,
          tree: line(game.moves, 0, startFen),
          white,
          black,
          result: tag('Result'),
          date: tag('Date'),
        },
        headers: {
          event: raw('Event'),
          site: raw('Site'),
          round: raw('Round'),
          date: raw('Date'),
          eco: raw('ECO'),
        },
      }
    } catch (e) {
      return {
        ok: false as const,
        error: `Game ${n + 1}: ${e instanceof Error ? e.message : 'not readable'}`,
      }
    }
  })
}

/** The move at `i` continues the line; its PGN variations are its siblings, played from the same position. */
function line(moves: ReadonlyArray<PgnMove>, i: number, fen: string): Array<StudyMoveInput> {
  const move = moves[i]
  if (!move) return []
  const played = play(fen, move.notation.notation)
  const main: StudyMoveInput = { uci: played.uci, children: line(moves, i + 1, played.fen) }
  return [main, ...move.variations.flatMap((variation) => line(variation, 0, fen))]
}

function play(fen: string, san: string): { uci: string; fen: string } {
  const board = new Chess(fen)
  const m = board.move(san) // throws on an illegal move, which reports the game
  return { uci: `${m.from}${m.to}${m.promotion ?? ''}`, fen: board.fen() }
}

/**
 * A move played on the study board, as a tree node: chess.js gives the SAN and FEN at once (feedback only, like the game
 * page); the server replays and replaces them on save. Null when chess.js finds the move illegal.
 */
export function playMove(fen: string, uci: string): StudyMove | null {
  try {
    const board = new Chess(fen)
    const promotion = uci[4]
    const m = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(promotion ? { promotion } : {}),
    })
    return { uci, san: m.san, fen: board.fen(), children: [] }
  } catch {
    return null
  }
}

/** How a move is numbered in a line: `12.` before White's move, `12...` before Black's when it starts a line. */
export function moveNumber(fenBefore: string, startsLine: boolean): string | null {
  const [, side, , , , number] = fenBefore.split(' ')
  if (side === 'w') return `${number ?? '1'}.`
  return startsLine ? `${number ?? '1'}...` : null
}

/** A FEN chess.js accepts as a legal position (both kings, six fields, a sane side to move). */
export function isFen(text: string): boolean {
  return validateFen(text.trim()).ok
}

/** A game's moves (the API's list, in ply order) as a study main line from the standard start. */
export function fromGame(
  moves: ReadonlyArray<{ uci: string; san: string; fenAfter: string }>,
): Array<StudyMove> {
  return moves.reduceRight<Array<StudyMove>>(
    (children, m) => [{ uci: m.uci, san: m.san, fen: m.fenAfter, children }],
    [],
  )
}

/** UCI moves (a parsed PGN) replayed from `startFen` into a tree with SAN and FEN; an illegal move ends its line. */
export function fromInput(
  startFen: string,
  input: ReadonlyArray<StudyMoveInput>,
): Array<StudyMove> {
  return input.flatMap((m) => {
    const played = playMove(startFen, m.uci)
    return played ? [{ ...played, children: fromInput(played.fen, m.children) }] : []
  })
}

/**
 * PGN as files really come (game-library): Windows or old Mac line ends become `\n`, and the blank lines the standard
 * puts between a game's headers and its movetext, and between games, are put back — without them the splitter cannot
 * tell the games apart.
 */
export function normalisePgn(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(\[[^\n]*\])\n(?=[^[\n])/gm, '$1\n\n') // headers straight into movetext
    .replace(/^([^[\n][^\n]*)\n(?=\[)/gm, '$1\n\n') // movetext straight into the next game's headers
}

/** What a study knows about the game it came from; missing values are written as PGN's unknowns. */
export interface StudyHeaders {
  white?: string | null
  black?: string | null
  result?: string | null
  date?: string | null
}

const DECIDED = new Set(['1-0', '0-1', '1/2-1/2'])

/**
 * A study as PGN (studies D3): the seven-tag roster (Event is the title), `SetUp`/`FEN` for a custom start, and movetext
 * with each variation in parentheses right after the move it replaces. As the backend's `StudyPgn.Build`.
 */
export function studyPgn(
  title: string,
  headers: StudyHeaders,
  startFen: string,
  tree: ReadonlyArray<StudyMove>,
  site = 'chess',
): string {
  const result = headers.result && DECIDED.has(headers.result) ? headers.result : '*'
  const tag = (name: string, value: string) =>
    `[${name} "${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]\n`
  let pgn =
    tag('Event', title) +
    tag('Site', site) +
    tag('Date', headers.date ?? '????.??.??') +
    tag('Round', '-') +
    tag('White', headers.white ?? '?') +
    tag('Black', headers.black ?? '?') +
    tag('Result', result)
  if (startFen !== STANDARD_START) pgn += tag('SetUp', '1') + tag('FEN', startFen)
  const tokens: Array<string> = []
  pgnLine(tokens, startFen, tree, true)
  tokens.push(result)
  return `${pgn}\n${tokens.join(' ').replaceAll('( ', '(').replaceAll(' )', ')')}\n`
}

/** The first move continues the line; the others follow it as variations. */
function pgnLine(
  tokens: Array<string>,
  fenBefore: string,
  moves: ReadonlyArray<StudyMove>,
  forceNumber: boolean,
) {
  const [main, ...variations] = moves
  if (!main) return
  pgnMove(tokens, fenBefore, main, forceNumber)
  for (const v of variations) {
    tokens.push('(')
    pgnMove(tokens, fenBefore, v, true)
    pgnLine(tokens, v.fen, v.children, false)
    tokens.push(')')
  }
  // After a variation, the main line resumes with its move number even on Black's move ("3... Nc6").
  pgnLine(tokens, main.fen, main.children, moves.length > 1)
}

function pgnMove(tokens: Array<string>, fenBefore: string, move: StudyMove, forceNumber: boolean) {
  const fields = fenBefore.split(' ')
  const number = fields[5] ?? '1'
  if (fields[1] === 'b') {
    if (forceNumber) tokens.push(`${number}...`)
  } else tokens.push(`${number}.`)
  tokens.push(move.san)
}
