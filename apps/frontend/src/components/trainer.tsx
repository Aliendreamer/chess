import { Link } from '@tanstack/react-router'
import type {
  Drill,
  FamilyProgress,
  RunResult,
  TrainedFamily,
  TrainerColor,
  TrainerLine,
} from '#/lib/trainer'
import { lineState, sanAt } from '#/lib/trainer'

/**
 * The opening trainer (opening-trainer): families with their progress, the drill's feedback, a family's lines, and the
 * families on the member's own profile. Presentational; the drill itself is `useDrill` in `lib/trainer.ts`.
 */

const COLOR_LABEL: Record<TrainerColor, string> = { white: 'White', black: 'Black' }

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function dueText(at: string): string {
  return DAY.format(new Date(at))
}

/** "23 of 41 learned" with a bar. */
export function LearnedBar({ learned, lines }: { learned: number; lines: number }) {
  const label = `${learned} of ${lines} learned`
  const share = lines === 0 ? 0 : Math.round((learned / lines) * 100)
  return (
    <span className="flex items-center gap-3">
      <span
        role="img"
        aria-label={label}
        className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-inset"
      >
        <span className="bg-status-win" style={{ width: `${share}%` }} />
      </span>
      <span className="font-mono text-xs text-fg-secondary">{label}</span>
    </span>
  )
}

const CHIP =
  'rounded-pill border px-3 py-1.5 text-sm no-underline pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center'

/** The colour to train, as links (works before hydration); `family` keeps the family, `q` the search. */
export function ColorSwitch({
  color,
  family,
  q,
}: {
  color: TrainerColor
  family?: string
  q?: string
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Train as">
      {(['white', 'black'] as const).map((c) => {
        const className = `${CHIP} ${c === color ? 'border-line-accent bg-surface-accent-tint text-fg-primary' : 'border-line-default text-fg-body hover:bg-surface-hover'}`
        const current = c === color ? ({ 'aria-current': 'page' } as const) : {}
        return family ? (
          <Link
            key={c}
            to="/trainer/$family"
            params={{ family }}
            search={{ color: c }}
            className={className}
            {...current}
          >
            {`As ${COLOR_LABEL[c]}`}
          </Link>
        ) : (
          <Link
            key={c}
            to="/trainer"
            search={{ color: c, ...(q ? { q } : {}) }}
            className={className}
            {...current}
          >
            {`As ${COLOR_LABEL[c]}`}
          </Link>
        )
      })}
    </div>
  )
}

export function FamilyList({
  families,
  color,
}: {
  families: ReadonlyArray<FamilyProgress>
  color: TrainerColor
}) {
  if (families.length === 0)
    return <p className="m-0 text-sm text-fg-secondary">No opening matches.</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="trainer-families">
      {families.map((f) => (
        <li
          key={f.name}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-divider py-2.5"
        >
          <Link
            to="/trainer/$family"
            params={{ family: f.name }}
            search={{ color }}
            className="min-w-0 text-fg-primary no-underline hover:text-fg-accent"
          >
            {f.name}
            <span className="ml-2 text-xs text-fg-muted">{plural(f.lines, 'line', 'lines')}</span>
          </Link>
          <LearnedBar learned={f.learned} lines={f.lines} />
        </li>
      ))}
    </ul>
  )
}

/** What the drill wants now: the member's move, the board's, or the right move after a wrong one. */
export function DrillStatus({
  line,
  ply,
  yourMove,
  wrong,
}: {
  line: TrainerLine
  ply: number
  yourMove: boolean
  wrong: Drill['wrong']
}) {
  const text = wrong
    ? `${sanAt(line.moves, ply, wrong.played)} is not the line. Play ${sanAt(line.moves, ply)}.`
    : yourMove
      ? 'Your move.'
      : 'The board plays…'
  return (
    <p
      className={`m-0 text-sm ${wrong ? 'text-status-loss' : 'text-fg-secondary'}`}
      data-testid="drill-status"
      aria-live="polite"
    >
      {text}
    </p>
  )
}

/** What a finished run did to the line. */
export function RunOutcome({ result, mistakes }: { result: RunResult; mistakes: number }) {
  const text =
    mistakes > 0
      ? `${plural(mistakes, 'mistake', 'mistakes')}. This line comes back first.`
      : `Clean. ${result.learned ? 'Learned — due' : 'Due'} again ${dueText(result.dueAt)}.`
  return (
    <p className="m-0 text-sm text-fg-primary" data-testid="run-outcome" aria-live="polite">
      {text}
    </p>
  )
}

export function LinesTable({ lines }: { lines: ReadonlyArray<TrainerLine> }) {
  return (
    <table className="w-full border-collapse text-sm" aria-label="Lines">
      <thead>
        <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
          <th className="py-1.5 font-medium">Line</th>
          <th className="py-1.5 font-medium">ECO</th>
          <th className="py-1.5 font-medium">State</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const state = lineState(l)
          return (
            <tr key={l.key} className="border-t border-line-divider">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {l.name}
              </th>
              <td className="py-2 pr-3 font-mono text-fg-secondary">{l.eco}</td>
              <td
                className={`py-2 ${state === 'learned' ? 'text-status-win' : state === 'learning' ? 'text-fg-accent' : 'text-fg-muted'}`}
              >
                {state}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** The member's own profile: the families they have trained. */
export function TrainedFamilies({ families }: { families: ReadonlyArray<TrainedFamily> }) {
  if (families.length === 0)
    return (
      <p className="m-0 text-sm text-fg-secondary">
        No openings trained yet.{' '}
        <Link to="/trainer" search={{ color: 'white' }} className="text-fg-accent">
          Open the trainer
        </Link>
      </p>
    )
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="trained-families">
      {families.map((f) => (
        <li
          key={`${f.name}|${f.color}`}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-divider py-2"
        >
          <Link
            to="/trainer/$family"
            params={{ family: f.name }}
            search={{ color: f.color }}
            className="text-fg-primary no-underline hover:text-fg-accent"
          >
            {`${f.name} · as ${COLOR_LABEL[f.color]}`}
          </Link>
          <LearnedBar learned={f.learned} lines={f.lines} />
        </li>
      ))}
    </ul>
  )
}
