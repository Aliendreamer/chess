import type { Color } from '#/lib/games'
import type { Piece } from '#/lib/moveInput'
import { placement, squaresFor } from '#/lib/moveInput'

const GLYPH: Record<Piece['type'], string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const NAME: Record<Piece['type'], string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}
// VS15 asks for the text (not emoji) presentation of the glyph.
const TEXT = '︎'

export interface BoardProps {
  fen: string
  orientation: Color
  /** The last move's squares, tinted gold. */
  lastMove?: { from: string; to: string } | null
  selected?: string | null
  /** Legal destinations of the selected piece (dots). */
  targets?: ReadonlyArray<string>
  /** Without it the board is read-only (spectators, ended games, not your turn). */
  onSquareClick?: (square: string) => void
}

/**
 * The Club board: classic wood tones, a 1px ring, Unicode pieces sized by container units so it stays fluid up to
 * 600px. Presentational: which squares are selectable is the page's decision.
 */
export function Board({
  fen,
  orientation,
  lastMove,
  selected,
  targets = [],
  onSquareClick,
}: BoardProps) {
  const pieces = placement(fen)
  const squares = squaresFor(orientation)
  const bottomRank = orientation === 'white' ? '1' : '8'
  const leftFile = orientation === 'white' ? 'a' : 'h'
  return (
    <div
      role="grid"
      aria-label="Chess board"
      className="@container grid aspect-square w-full max-w-(--board-max) grid-cols-8 overflow-hidden rounded-board ring-1 ring-ink-550"
    >
      {squares.map((square) => {
        const file = square.charCodeAt(0) - 97
        const rank = Number(square[1])
        const light = (file + rank) % 2 === 1
        const piece = pieces[square]
        const tinted = lastMove && (lastMove.from === square || lastMove.to === square)
        const background = tinted
          ? light
            ? 'bg-board-last-light'
            : 'bg-board-last-dark'
          : light
            ? 'bg-board-light'
            : 'bg-board-dark'
        const coord = light ? 'text-board-dark' : 'text-board-light'
        const label = piece
          ? `${square} ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}`
          : square
        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            data-square={square}
            aria-label={label}
            aria-selected={selected === square}
            disabled={!onSquareClick}
            onClick={onSquareClick ? () => onSquareClick(square) : undefined}
            className={`relative grid aspect-square place-items-center border-0 p-0 ${background} ${onSquareClick ? 'cursor-pointer' : 'cursor-default'} ${selected === square ? 'ring-2 ring-brass-400 ring-inset' : ''}`}
          >
            {piece ? (
              <span
                aria-hidden
                className={`text-[9cqi] leading-none ${piece.color === 'w' ? 'text-piece-white [-webkit-text-stroke:1.2px_var(--color-piece-white-stroke)]' : 'text-piece-black'}`}
              >
                {GLYPH[piece.type] + TEXT}
              </span>
            ) : null}
            {targets.includes(square) ? (
              <span
                aria-hidden
                className={`absolute rounded-full bg-ink-900/35 ${piece ? 'inset-[6%] bg-transparent ring-4 ring-ink-900/35' : 'size-[28%]'}`}
              />
            ) : null}
            {square[0] === leftFile ? (
              <span
                aria-hidden
                className={`absolute top-[3px] left-1 text-[1.5cqi] font-semibold ${coord}`}
              >
                {square[1]}
              </span>
            ) : null}
            {square[1] === bottomRank ? (
              <span
                aria-hidden
                className={`absolute right-1 bottom-0.5 text-[1.5cqi] font-semibold ${coord}`}
              >
                {square[0]}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export interface PromotionPickerProps {
  color: Color
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel: () => void
}

/** The four promotion choices, queen first. */
export function PromotionPicker({ color, onPick, onCancel }: PromotionPickerProps) {
  const tone =
    color === 'white'
      ? 'text-piece-white [-webkit-text-stroke:1px_var(--color-piece-white-stroke)]'
      : 'text-piece-black'
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
          className="grid size-12 cursor-pointer place-items-center rounded-control bg-board-light text-[34px] leading-none hover:bg-board-last-light"
        >
          <span aria-hidden className={tone}>
            {GLYPH[type] + TEXT}
          </span>
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
