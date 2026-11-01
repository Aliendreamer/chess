import { useEffect, useState } from 'react'
import {
  addMove,
  clickSquare,
  fenAt,
  legalTargets,
  lineEnd,
  needsPromotion,
  nextPath,
  nodeAt,
  playMove,
} from '@chess/core'
import type { Color, StudyMove, StudyView, TreePath } from '@chess/core'

export type { StudyView, StudyListItem, ImportResult } from '@chess/core'

/**
 * Studies in the club (studies D1–D3): the API's study shapes, the byline, and the move-tree editor the study and
 * analysis pages share. The tree itself and PGN import are `@chess/core`.
 */

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

/** A move-tree command from the platform: a key on a computer, a swipe or button on a phone. */
export type MoveTreeKey = 'back' | 'forward' | 'start' | 'end' | 'flip'

/** Subscribes the editor to the platform's commands; returns the unsubscribe. `@chess/ui` passes the DOM's keys. */
export type MoveTreeKeys = (onKey: (key: MoveTreeKey) => void) => () => void

/**
 * A move tree being edited on a board (analysis-board): moves played go into the tree (an existing continuation is
 * followed, anything else becomes a variation); the platform's `keys` walk the line and turn the board (on a computer
 * ← → Home End and `f`, except while typing in a field).
 */
export function useMoveTree(
  initialStart: string,
  initialTree: Array<StudyMove>,
  initialPath: TreePath = [],
  keys?: MoveTreeKeys,
): MoveTreeEditor {
  const [startFen, setStartFen] = useState(initialStart)
  const [tree, setTree] = useState<Array<StudyMove>>(initialTree)
  const [path, setPath] = useState<TreePath>(initialPath)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{
    from: string
    to: string
  } | null>(null)
  const [orientation, setOrientation] = useState<Color>('white')

  const fen = fenAt(startFen, tree, path)
  const side = fen.split(' ')[1] === 'b' ? 'b' : 'w'

  useEffect(() => {
    if (!keys) return
    return keys((key) => {
      if (key === 'back') setPath((p) => p.slice(0, -1))
      else if (key === 'forward') setPath((p) => nextPath(tree, p) ?? p)
      else if (key === 'start') setPath([])
      else if (key === 'end') setPath((p) => lineEnd(tree, p))
      else setOrientation((o) => (o === 'white' ? 'black' : 'white'))
      setSelected(null)
    })
  }, [tree, keys])

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

/** The title an analysis is saved under: the game's players when it came from one. */
export function analysisTitle(players?: { white: string; black: string }): string {
  return players ? `${players.white} vs ${players.black}, analysis` : 'Analysis'
}
