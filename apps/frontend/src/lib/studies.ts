import { parseGame, split } from '@mliebelt/pgn-parser'
import { Chess } from 'chess.js'
import type { ParseTree } from '@mliebelt/pgn-parser'

/**
 * Studies (studies D1–D3): the move tree, the operations the board performs on it, and PGN import. Client-safe and
 * pure. The tree the page edits is only a draft: the server replays it and answers with its own SAN and FEN.
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

export interface StudyView {
  id: string
  ownerId: number
  ownerName: string
  title: string
  startFen: string
  tree: Array<StudyMove>
  white: string | null
  black: string | null
  result: string | null
  date: string | null
  shared: boolean
  version: number
  mine: boolean
  createdAt: string
  updatedAt: string
}

export interface StudyListItem {
  id: string
  title: string
  white: string | null
  black: string | null
  shared: boolean
  createdAt: string
  updatedAt: string
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

export interface ImportResult {
  created: Array<Pick<StudyListItem, 'id' | 'title'>>
  refused: Array<{ index: number; error: string }>
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
export type ParsedGame = { ok: true; study: StudyInput } | { ok: false; error: string }

/**
 * PGN text → one study per game (studies D3): each game is split out and parsed on its own, so a broken game is
 * reported and the others still import. SAN becomes UCI by playing it with chess.js from the game's start (the FEN
 * tag, or the standard start). Comments, NAGs and clocks are dropped.
 */
export function parsePgn(text: string): Array<ParsedGame> {
  return split(text, { startRule: 'games' }).map((part, n) => {
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
