import { createContext, use, useEffect, useId, useState } from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import { ArrowUpDown } from 'lucide-react'
import {
  DEFAULT_PREFERENCES,
  animationMs as animationMsOf,
  checkSquare,
  placement,
  squaresFor,
} from '@chess/core'
import bB from './pieces/bB.svg?url'
import bK from './pieces/bK.svg?url'
import bN from './pieces/bN.svg?url'
import bP from './pieces/bP.svg?url'
import bQ from './pieces/bQ.svg?url'
import bR from './pieces/bR.svg?url'
import wB from './pieces/wB.svg?url'
import wK from './pieces/wK.svg?url'
import wN from './pieces/wN.svg?url'
import wP from './pieces/wP.svg?url'
import wQ from './pieces/wQ.svg?url'
import wR from './pieces/wR.svg?url'
import type { CSSProperties } from 'react'
import type { ChessboardOptions, PieceRenderObject } from 'react-chessboard'
import type { Color, Piece, Preferences, SquarePair } from '@chess/core'

/**
 * What the board shows on top of the position (board-look): lichess-style highlights as react-chessboard square
 * styles, and the premove rule. The colours are theme variables from `theme.css`, so a board theme changes them all.
 */

export interface Highlights {
  lastMove?: SquarePair | null | undefined
  selected?: string | null | undefined
  /** Legal targets of the selected piece: a dot on an empty square, a ring on a capture. */
  targets?: ReadonlyArray<string> | undefined
  premove?: SquarePair | null | undefined
  /** Squares circled with a right-click. */
  circles?: ReadonlyArray<string> | undefined
}

const DOT = 'radial-gradient(var(--board-target) 19%, transparent 20%)'
const RING = 'radial-gradient(transparent 79%, var(--board-target) 80%)'
const CHECK =
  'radial-gradient(ellipse at center, rgba(255, 0, 0, 1) 0%, rgba(231, 0, 0, 1) 25%, rgba(169, 0, 0, 0) 89%)'

/** The Cburnett pieces (Wikimedia, BSD-3; see apps/frontend/ATTRIBUTION.md), bundled by each app as assets. */
const PIECES: Record<string, string> = { bB, bK, bN, bP, bQ, bR, wB, wK, wN, wP, wQ, wR }

export function pieceSrc(color: Piece['color'], type: Piece['type']): string {
  return PIECES[`${color}${type.toUpperCase()}`]!
}

/** Square styles for react-chessboard: only the squares that carry a highlight are present. */
export function squareStyles(fen: string, h: Highlights): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {}
  const add = (square: string, style: CSSProperties) => {
    styles[square] = { ...styles[square], ...style }
  }
  const pieces = placement(fen)
  if (h.lastMove) {
    add(h.lastMove.from, { backgroundColor: 'var(--board-last)' })
    add(h.lastMove.to, { backgroundColor: 'var(--board-last)' })
  }
  if (h.premove) {
    add(h.premove.from, { backgroundColor: 'var(--board-premove)' })
    add(h.premove.to, { backgroundColor: 'var(--board-premove)' })
  }
  if (h.selected) add(h.selected, { backgroundColor: 'var(--board-selected)' })
  const check = checkSquare(fen)
  if (check) add(check, { backgroundImage: CHECK })
  for (const target of h.targets ?? []) {
    add(target, { backgroundImage: pieces[target] ? RING : DOT })
  }
  for (const circle of h.circles ?? []) {
    add(circle, { boxShadow: 'inset 0 0 0 4px var(--board-circle)', borderRadius: '50%' })
  }
  return styles
}

/** The player's display preferences under the app's shell; the board reads animation and coordinates from it. */
export const PreferencesContext = createContext<Preferences>(DEFAULT_PREFERENCES)

/** The flip-board icon for the game page's nav bar. */
export function FlipIcon() {
  return <ArrowUpDown aria-hidden size={16} />
}

const NAME: Record<Piece['type'], string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}

/** A Cburnett piece (board-look). Decorative: the square or button around it carries the name. */
export function PieceImage({ piece, className }: { piece: Piece; className?: string }) {
  return (
    <img
      src={pieceSrc(piece.color, piece.type)}
      alt=""
      draggable={false}
      className={className ?? 'size-full'}
    />
  )
}

const PIECE_RENDERERS: PieceRenderObject = Object.fromEntries(
  (['w', 'b'] as const).flatMap((color) =>
    (['k', 'q', 'r', 'b', 'n', 'p'] as const).map((type) => [
      `${color}${type.toUpperCase()}`,
      () => <PieceImage piece={{ color, type }} />,
    ]),
  ),
)

// Lichess's green, and red, blue and yellow for shift-, ctrl- and alt-drags.
const ARROW_OPTIONS = {
  ...defaultArrowOptions,
  colors: {
    default: 'rgba(21, 120, 27, 0.8)',
    shift: 'rgba(160, 30, 20, 0.8)',
    ctrl: 'rgba(20, 60, 160, 0.8)',
    alt: 'rgba(230, 160, 0, 0.8)',
    meta: 'rgba(20, 60, 160, 0.8)',
  },
}

export interface BoardProps {
  fen: string
  orientation: Color
  lastMove?: SquarePair | null
  selected?: string | null
  /** Legal destinations of the selected piece (dots, rings on captures). */
  targets?: ReadonlyArray<string>
  /** A queued premove, tinted until it is played or dropped. */
  premove?: SquarePair | null
  /** Without it the board is read-only (spectators, ended games, earlier positions). */
  onSquareClick?: (square: string) => void
  /** A piece dropped on another square; false puts it back. Without it nothing can be dragged. */
  onDrop?: (from: string, to: string) => boolean
  /** Whether the piece on `square` may be picked up (default: any piece, when `onDrop` is set). */
  canDrag?: (square: string) => boolean
  /** A right-click: circles the square, and lets the page drop a premove. */
  onRightClick?: () => void
  /** Piece slide time (default: the user's preference); 0 under prefers-reduced-motion whatever is set. */
  animationMs?: number
  /** Arrows the page draws (the review's better move), beside any the user draws. */
  arrows?: ReadonlyArray<SquarePair>
}

/** The board's frame: one size for the placeholder and the live board, so nothing moves when it appears. */
/** How far the pointer must move before a press becomes a drag. */
const DRAG_DISTANCE_PX = 6

const FRAME = 'aspect-square w-full max-w-(--board-max) overflow-hidden rounded-board'

/**
 * The board (board-look): react-chessboard with Cburnett pieces, the active board theme and lichess highlights.
 * Drawn in the browser only; the server renders the empty board in its place. Presentational: what may be clicked,
 * dragged or premoved is the page's decision, and the server still decides every move.
 */
export function Board({
  fen,
  orientation,
  lastMove,
  selected,
  targets = [],
  premove,
  onSquareClick,
  onDrop,
  canDrag,
  onRightClick,
  animationMs,
  arrows = [],
}: BoardProps) {
  const id = `board${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const prefs = use(PreferencesContext)
  const slide = animationMs ?? animationMsOf(prefs.animation)
  const mounted = useMounted()
  const reducedMotion = useReducedMotion()
  const [circles, setCircles] = useState<ReadonlyArray<string>>([])
  // Drawn shapes belong to one position.
  useEffect(() => setCircles([]), [fen])

  if (!mounted) return <BoardPlaceholder orientation={orientation} />

  const options: ChessboardOptions = {
    id,
    position: fen,
    boardOrientation: orientation,
    pieces: PIECE_RENDERERS,
    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
    darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
    lightSquareNotationStyle: { color: 'var(--board-dark)' },
    darkSquareNotationStyle: { color: 'var(--board-light)' },
    alphaNotationStyle: {
      fontSize: 'max(9px, 1.6cqi)',
      fontWeight: 600,
      position: 'absolute',
      bottom: 1,
      right: 4,
    },
    numericNotationStyle: {
      fontSize: 'max(9px, 1.6cqi)',
      fontWeight: 600,
      position: 'absolute',
      top: 2,
      left: 3,
    },
    squareStyles: squareStyles(fen, { lastMove, selected, targets, premove, circles }),
    animationDurationInMs: reducedMotion ? 0 : slide,
    showAnimations: !reducedMotion && slide > 0,
    showNotation: prefs.coordinates,
    allowDragging: onDrop !== undefined,
    // A click that wobbles a pixel or two is still a click: the library's default (1px) turned it into a drag that
    // went nowhere, so the piece was not selected.
    dragActivationDistance: DRAG_DISTANCE_PX,
    allowDragOffBoard: false,
    allowDrawingArrows: true,
    arrowOptions: ARROW_OPTIONS,
    arrows: arrows.map((a) => ({
      startSquare: a.from,
      endSquare: a.to,
      color: ARROW_OPTIONS.colors.default,
    })),
    clearArrowsOnPositionChange: true,
    ...(canDrag ? { canDragPiece: ({ square }) => square !== null && canDrag(square) } : {}),
    ...(onSquareClick ? { onSquareClick: ({ square }) => onSquareClick(square) } : {}),
    ...(onDrop
      ? {
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (targetSquare === null) return false
            // A drag back onto its own square is a click on it (it selects the piece).
            if (targetSquare === sourceSquare) {
              onSquareClick?.(sourceSquare)
              return false
            }
            return onDrop(sourceSquare, targetSquare)
          },
        }
      : {}),
    onSquareRightClick: ({ square }) => {
      setCircles((now) =>
        now.includes(square) ? now.filter((c) => c !== square) : [...now, square],
      )
      onRightClick?.()
    },
  }
  return (
    <div role="group" aria-label="Chess board" className={`@container ${FRAME}`}>
      <Chessboard options={options} />
    </div>
  )
}

/** The server-rendered stand-in: the empty board in the theme's colours, every square named by `data-square`. */
export function BoardPlaceholder({ orientation }: { orientation: Color }) {
  return (
    <div role="group" aria-label="Chess board" className={`grid grid-cols-8 ${FRAME}`}>
      {squaresFor(orientation).map((square) => {
        // a1 is dark, h1 light: file index + rank is odd on the dark squares.
        const light = (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0
        return (
          <div
            key={square}
            data-square={square}
            className={`aspect-square ${light ? 'bg-board-light' : 'bg-board-dark'}`}
          />
        )
      })}
    </div>
  )
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    // jsdom has no matchMedia; every browser does.
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export interface PromotionPickerProps {
  color: Color
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel: () => void
}

/** The four promotion choices, queen first. */
export function PromotionPicker({ color, onPick, onCancel }: PromotionPickerProps) {
  return (
    <div
      role="dialog"
      aria-label="Promote to"
      className="flex items-center gap-2 rounded-card border border-line-accent bg-surface-accent-soft p-2"
    >
      {(['q', 'r', 'b', 'n'] as const).map((type) => (
        <button
          key={type}
          type="button"
          aria-label={NAME[type]}
          onClick={() => onPick(type)}
          className="grid size-12 cursor-pointer place-items-center rounded-control bg-board-light p-1 hover:bg-board-dark"
        >
          <PieceImage piece={{ color: color === 'white' ? 'w' : 'b', type }} />
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="ml-1 cursor-pointer text-sm text-fg-secondary"
      >
        Cancel
      </button>
    </div>
  )
}
