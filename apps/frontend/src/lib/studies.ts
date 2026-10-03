import { useEffect, useState } from 'react'
import { parseGame, split } from '@mliebelt/pgn-parser'
import { Chess, validateFen } from 'chess.js'
import { clickSquare, legalTargets, needsPromotion } from './moveInput'
import type { ParseTree } from '@mliebelt/pgn-parser'
import type { Color, MoveItem } from './games'

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

/** The line under a study's title (ui-polish): the players, a known result, and the owner when it is not yours. */
export function studyByline(
  study: Pick<StudyView, 'white' | 'black' | 'result' | 'ownerName'>,
  editable: boolean,
): string {
  return [
    study.white && study.black ? `${study.white} – ${study.black}` : null,
    study.result && study.result !== '*' ? study.result : null,
    editable ? null : `by ${study.ownerName} · read-only`,
  ]
    .filter(Boolean)
    .join(' · ')
}

type Promotion = 'q' | 'r' | 'b' | 'n'

/** What the board and the tree around it need (analysis-board): the study page and the analysis page share it. */
export interface MoveTreeEditor {
  startFen: string
  tree: Array<StudyMove>
  path: TreePath
  /** The position on the board: after the move at `path`. */
  fen: string
  current: StudyMove | null
  selected: string | null
  promotion: { from: string; to: string } | null
  orientation: Color
  setTree: (tree: Array<StudyMove>) => void
  setPath: (path: TreePath) => void
  /** Starts over from another position or game (a pasted FEN or PGN). */
  reset: (startFen: string, tree: Array<StudyMove>, path?: TreePath) => void
  onSquareClick: (square: string) => void
  /** A drag: a legal move goes into the tree (true), a promotion asks first (false), anything else is refused. */
  onDrop: (from: string, to: string) => boolean
  pickPromotion: (piece: Promotion) => void
  cancelPromotion: () => void
  /** An engine line from the current position: existing moves are followed, the rest added. */
  playLine: (moves: ReadonlyArray<StudyMove>) => void
  flip: () => void
}

/**
 * A move tree being edited on a board (analysis-board): moves played go into the tree (an existing continuation is
 * followed, anything else becomes a variation); ← → Home End walk the line and `f` turns the board, except while
 * typing in a field.
 */
export function useMoveTree(
  initialStart: string,
  initialTree: Array<StudyMove>,
  initialPath: TreePath = [],
): MoveTreeEditor {
  const [startFen, setStartFen] = useState(initialStart)
  const [tree, setTree] = useState<Array<StudyMove>>(initialTree)
  const [path, setPath] = useState<TreePath>(initialPath)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [orientation, setOrientation] = useState<Color>('white')

  const fen = fenAt(startFen, tree, path)
  const side = fen.split(' ')[1] === 'b' ? 'b' : 'w'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') setPath((p) => p.slice(0, -1))
      else if (e.key === 'ArrowRight') setPath((p) => nextPath(tree, p) ?? p)
      else if (e.key === 'Home') setPath([])
      else if (e.key === 'End') setPath((p) => lineEnd(tree, p))
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'))
      else return
      e.preventDefault()
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tree])

  function playOn(from: string, to: string, piece?: Promotion) {
    const move = playMove(fen, `${from}${to}${piece ?? ''}`)
    if (!move) return
    const next = addMove(tree, path, move)
    setTree(next.tree)
    setPath(next.path)
  }

  return {
    startFen,
    tree,
    path,
    fen,
    current: nodeAt(tree, path),
    selected,
    promotion,
    orientation,
    setTree,
    setPath: (p) => {
      setPath(p)
      setSelected(null)
    },
    reset: (start, next, at = []) => {
      setStartFen(start)
      setTree(next)
      setPath(at)
      setSelected(null)
      setPromotion(null)
    },
    onSquareClick: (square) => {
      const result = clickSquare(fen, side, selected, square)
      setSelected(result.selected)
      if (!result.move) return
      if (needsPromotion(fen, result.move.from, result.move.to)) {
        setPromotion(result.move)
        return
      }
      playOn(result.move.from, result.move.to)
    },
    onDrop: (from, to) => {
      setSelected(null)
      if (!legalTargets(fen, from).includes(to)) return false
      if (needsPromotion(fen, from, to)) {
        setPromotion({ from, to })
        return false
      }
      playOn(from, to)
      return true
    },
    pickPromotion: (piece) => {
      if (!promotion) return
      setPromotion(null)
      playOn(promotion.from, promotion.to, piece)
    },
    cancelPromotion: () => setPromotion(null),
    playLine: (moves) => {
      let next = { tree, path }
      for (const move of moves) next = addMove(next.tree, next.path, move)
      setTree(next.tree)
      setPath(next.path)
    },
    flip: () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
  }
}

/** A FEN chess.js accepts as a legal position (both kings, six fields, a sane side to move). */
export function isFen(text: string): boolean {
  return validateFen(text.trim()).ok
}

/** A game's moves (the API's list, in ply order) as a study main line from the standard start. */
export function fromGame(
  moves: ReadonlyArray<Pick<MoveItem, 'uci' | 'san' | 'fenAfter'>>,
): Array<StudyMove> {
  return moves.reduceRight<Array<StudyMove>>(
    (children, m) => [{ uci: m.uci, san: m.san, fen: m.fenAfter, children }],
    [],
  )
}

/** The title an analysis is saved under: the game's players when it came from one. */
export function analysisTitle(players?: { white: string; black: string }): string {
  return players ? `${players.white} vs ${players.black}, analysis` : 'Analysis'
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
