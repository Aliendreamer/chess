import { Fragment, useEffect, useRef } from 'react'
import { Cpu, Flame, Hourglass, Timer, Zap } from 'lucide-react'
import { categoryOf, pairMoves } from '@chess/core'
import { Button } from './ui.tsx'
import type { ReactNode } from 'react'
import type { Category } from '@chess/core'

/** The game type's marks (site-themes) and the move list and its navigation, as both apps' game pages show them. */

// Static class strings per game type (site-themes), so Tailwind sees every one.
const TC_BG: Record<Category, string> = {
  bullet: 'bg-tc-bullet',
  blitz: 'bg-tc-blitz',
  rapid: 'bg-tc-rapid',
  classical: 'bg-tc-classical',
  computer: 'bg-tc-computer',
}

/** The game type's colour as a background class: the quick-pairing tiles' top bar. */
export function categoryBar(timeControl: string): string {
  return TC_BG[categoryOf(timeControl)]
}

const TC_TEXT: Record<Category, string> = {
  bullet: 'text-tc-bullet',
  blitz: 'text-tc-blitz',
  rapid: 'text-tc-rapid',
  classical: 'text-tc-classical',
  computer: 'text-tc-computer',
}

const TC_ICON: Record<Category, typeof Zap> = {
  bullet: Zap,
  blitz: Flame,
  rapid: Timer,
  classical: Hourglass,
  computer: Cpu,
}

/** The game type's icon in its colour (site-themes); decorative, always next to the type's name. */
export function CategoryIcon({ timeControl }: { timeControl: string }) {
  const category = categoryOf(timeControl)
  const Icon = TC_ICON[category]
  return <Icon aria-hidden size={14} className={TC_TEXT[category]} />
}

/** A dot in the game type's colour, placed before the time control or the type's name. */
export function CategoryMark({ timeControl }: { timeControl: string }) {
  return <CategoryDot category={categoryOf(timeControl)} />
}

/** The game type's colour dot, for a type rather than one time control (a profile's record). */
export function CategoryDot({ category }: { category: Category }) {
  return (
    <span
      aria-hidden
      data-category={category}
      className={`inline-block size-2 shrink-0 rounded-full ${TC_BG[category]}`}
    />
  )
}

export interface MoveListProps {
  sans: ReadonlyArray<string>
  /** The ply on the board when looking back (1 = after White's first move); null or absent follows the game. */
  viewPly?: number | null
  /** Makes each move a button that shows the position after it. */
  onSelect?: (ply: number) => void
  /** The engine review's annotation per ply (`?!`, `?`, `??`), shown after the move (game-review). */
  marks?: ReadonlyArray<string>
}

/**
 * SAN in numbered rows; the move on the board is tinted. On a phone it is one line that scrolls sideways
 * (responsive-layout); either way, while following the game the latest move is kept in view.
 */
export function MoveList({ sans, viewPly = null, onSelect, marks = [] }: MoveListProps) {
  const rows = pairMoves(sans)
  const current = (viewPly ?? sans.length) - 1
  const list = useRef<HTMLOListElement>(null)
  const following = viewPly === null
  useEffect(() => {
    const el = list.current
    if (!el || !following) return
    el.scrollTop = el.scrollHeight
    el.scrollLeft = el.scrollWidth
  }, [sans.length, following])
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">No moves yet.</p>
  }
  const cell = (san: string | undefined, index: number) => {
    const tint = current === index ? 'bg-surface-current' : ''
    if (san === undefined) return <li className="px-2.5 py-[7px] max-shell:hidden" />
    const mark = marks[index] ? <span className="text-status-loss">{marks[index]}</span> : null
    if (!onSelect)
      return (
        <li className={`shrink-0 px-2.5 py-[7px] ${tint}`}>
          {san}
          {mark}
        </li>
      )
    return (
      <li className="flex shrink-0">
        <button
          type="button"
          aria-current={current === index}
          onClick={() => onSelect(index + 1)}
          className={`w-full cursor-pointer border-0 bg-transparent px-2.5 py-[7px] text-left font-mono text-sm text-fg-primary hover:bg-surface-hover ${tint}`}
        >
          {san}
          {mark}
        </button>
      </li>
    )
  }
  return (
    <ol
      aria-label="Moves"
      data-testid="move-list"
      ref={list}
      className="m-0 flex list-none overflow-x-auto rounded-card border border-line-default p-0 font-mono text-sm text-fg-primary shell:grid shell:max-h-80 shell:grid-cols-[36px_1fr_1fr] shell:overflow-x-hidden shell:overflow-y-auto"
    >
      {rows.map(([white, black], i) => (
        <Fragment key={i}>
          <li className="shrink-0 px-2.5 py-[7px] text-fg-muted shell:bg-surface-card">{i + 1}.</li>
          {cell(white, i * 2)}
          {cell(black, i * 2 + 1)}
        </Fragment>
      ))}
    </ol>
  )
}

export interface MoveNavProps {
  onStart: () => void
  onBack: () => void
  onForward: () => void
  onEnd: () => void
  /** Extra controls at the end of the bar (the game page's flip button). */
  children?: ReactNode
}

/** Start / back / forward / end through a game or a study line. */
export function MoveNav({ onStart, onBack, onForward, onEnd, children }: MoveNavProps) {
  return (
    <div className="flex gap-2" role="group" aria-label="Navigation">
      <Button aria-label="Start" onClick={onStart}>
        |◀
      </Button>
      <Button aria-label="Back" onClick={onBack}>
        ◀
      </Button>
      <Button aria-label="Forward" onClick={onForward}>
        ▶
      </Button>
      <Button aria-label="End" onClick={onEnd}>
        ▶|
      </Button>
      {children}
    </div>
  )
}
