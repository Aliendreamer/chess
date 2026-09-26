import { formatClock } from '#/lib/games'

export function Clock({ ms, active = false }: { ms: number; active?: boolean }) {
  return (
    <span
      className={`rounded-control px-3.5 py-1.5 font-mono text-clock tabular-nums ${active ? 'bg-brass-400 text-fg-on-accent' : 'bg-surface-raised text-fg-secondary'}`}
    >
      {formatClock(ms)}
    </span>
  )
}

export interface PlayerStripProps {
  name: string
  /** A short caption: "white · your move". */
  detail: string
  ms?: number
  /** The side to move: its clock is the brass one. */
  active?: boolean
  testId?: string
}

export function PlayerStrip({ name, detail, ms, active = false, testId }: PlayerStripProps) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid={testId}>
      <div className="flex flex-col">
        <span className="font-medium text-fg-primary">{name}</span>
        <span className="text-xs text-fg-secondary">{detail}</span>
      </div>
      {ms !== undefined ? <Clock ms={ms} active={active} /> : null}
    </div>
  )
}
