import { useState } from 'react'
import type { DeadLetter, ReplayOutcome } from '#/lib/admin'
import { firstLine } from '#/lib/admin'
import { Button } from '#/components/ui'

/** The admin screens (admin-screens): parked projection records, each with its error and a Replay. */

const PARKED = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

export function DeadLetterList({
  letters,
  onReplay,
}: {
  letters: ReadonlyArray<DeadLetter>
  onReplay: (groupId: string, aggregateId: string) => Promise<ReplayOutcome>
}) {
  if (letters.length === 0)
    return <p className="m-0 text-sm text-fg-secondary">Nothing is parked.</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="dead-letters">
      {letters.map((letter) => (
        <DeadLetterRow key={letter.id} letter={letter} onReplay={onReplay} />
      ))}
    </ul>
  )
}

function DeadLetterRow({
  letter,
  onReplay,
}: {
  letter: DeadLetter
  onReplay: (groupId: string, aggregateId: string) => Promise<ReplayOutcome>
}) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ReplayOutcome | null>(null)

  async function replay() {
    setBusy(true)
    try {
      setOutcome(await onReplay(letter.groupId, letter.aggregateId))
    } finally {
      setBusy(false)
    }
  }

  const headline = firstLine(letter.lastError)
  return (
    <li className="flex flex-col gap-2 border-b border-line-divider py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-sm">
          <span className="text-fg-accent">{letter.groupId}</span>
          <span className="truncate text-fg-primary">{letter.aggregateId}</span>
          <span className="text-fg-secondary">{`seq ${letter.seq} · ${letter.attempts} attempts`}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-fg-muted">{`parked ${PARKED.format(new Date(letter.parkedAt))} UTC`}</span>
          <Button
            size="sm"
            disabled={busy || outcome?.ok === true}
            aria-label={`Replay ${letter.groupId} ${letter.aggregateId}`}
            onClick={() => void replay()}
          >
            {busy ? 'Replaying…' : 'Replay'}
          </Button>
        </span>
      </div>
      <p className="m-0 text-sm text-status-loss">{headline}</p>
      {letter.lastError !== headline ? (
        <details className="text-xs text-fg-secondary">
          <summary className="cursor-pointer">Whole error</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-control bg-surface-inset p-3 font-mono">
            {letter.lastError}
          </pre>
        </details>
      ) : null}
      {outcome ? (
        <p
          role="status"
          className={`m-0 text-sm ${outcome.ok ? 'text-status-win' : 'text-status-loss'}`}
        >
          {outcome.ok ? `Replayed ${outcome.applied}.` : `Failed again: ${outcome.error}`}
        </p>
      ) : null}
    </li>
  )
}
