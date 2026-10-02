import { useState } from 'react'
import type { DeadLetter, ReplayOutcome } from '#/lib/admin'
import type { ImportAnswer, ImportBatch, ImportGame } from '#/lib/library'
import type { CommandOutcome } from '#/lib/games'
import { IMPORT_BATCH, batches, toImportGame } from '#/lib/library'
import { parsePgn } from '#/lib/studies'
import { firstLine } from '#/lib/admin'
import { Button, ErrorText, buttonClass, useAdoptTyped } from '#/components/ui'

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

/**
 * Import to library (game-library D3): a PGN file (or pasted PGN) with its source and licence. The browser parses
 * it, sends the games in batches of 100 one after another, and lists every game that was refused and why — a game
 * that does not parse is reported here, one that does not replay is reported by the server.
 */
export function LibraryImportForm({
  onImport,
}: {
  onImport: (batch: ImportBatch) => Promise<CommandOutcome<ImportAnswer>>
}) {
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [licence, setLicence] = useState('')
  const [sourceRef, setSourceRef] = useState<string | null>(null)
  const [wc, setWc] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totals, setTotals] = useState<{
    imported: number
    duplicates: number
    refused: number
  } | null>(null)
  const [problems, setProblems] = useState<Array<string>>([])
  const sourceField = useAdoptTyped<HTMLInputElement>(setSource)
  const licenceField = useAdoptTyped<HTMLInputElement>(setLicence)
  const textField = useAdoptTyped<HTMLTextAreaElement>(setText)

  async function run() {
    setBusy(true)
    setError(null)
    setTotals(null)
    const parsed = parsePgn(text)
    const found: Array<string> = []
    const games: Array<{ n: number; game: ImportGame }> = []
    parsed.forEach((p, n) => {
      if (p.ok) games.push({ n, game: toImportGame(p) })
      else found.push(p.error)
    })
    const sum = { imported: 0, duplicates: 0, refused: found.length }
    const chunks = batches(games, IMPORT_BATCH)
    try {
      for (const [i, chunk] of chunks.entries()) {
        setProgress(`Batch ${i + 1} of ${chunks.length}…`)
        const outcome = await onImport({
          source: source.trim(),
          licence: licence.trim(),
          sourceRef,
          worldChampionship: wc,
          games: chunk.map((c) => c.game),
        })
        if (!outcome.ok) {
          setError(outcome.error)
          return
        }
        sum.imported += outcome.view.imported
        sum.duplicates += outcome.view.duplicates
        sum.refused += outcome.view.refused
        for (const item of outcome.view.items) {
          if (item.status === 'refused')
            found.push(`Game ${chunk[item.index]!.n + 1}: ${item.error ?? 'refused'}`)
        }
      }
      setTotals(sum)
    } finally {
      setProblems(found)
      setProgress(null)
      setBusy(false)
    }
  }

  const ready = text.trim() !== '' && source.trim() !== '' && licence.trim() !== ''
  return (
    <div className="flex flex-col gap-3" data-testid="library-import">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          Source
          <input
            ref={sourceField}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={100}
            placeholder="PGN Mentor"
            className="rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          Licence
          <input
            ref={licenceField}
            value={licence}
            onChange={(e) => setLicence(e.target.value)}
            maxLength={100}
            placeholder="moves only (facts) / CC BY-SA 4.0"
            className="rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary"
          />
        </label>
      </div>
      <textarea
        ref={textField}
        aria-label="PGN"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Paste PGN, or choose a file"
        className="w-full rounded-control border border-line-default bg-surface-inset p-3 font-mono text-sm text-fg-primary"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${buttonClass('outline', 'sm')} cursor-pointer`}>
          Choose a .pgn file
          <input
            type="file"
            accept=".pgn,text/plain"
            aria-label="PGN file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                setSourceRef(file.name)
                void file.text().then(setText)
              }
              e.target.value = ''
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-body">
          <input type="checkbox" checked={wc} onChange={(e) => setWc(e.target.checked)} />
          World Championship games
        </label>
        <Button variant="primary" disabled={!ready || busy} onClick={() => void run()}>
          Import to library
        </Button>
        {progress ? <span className="text-sm text-fg-secondary">{progress}</span> : null}
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {totals ? (
        <p role="status" className="m-0 text-sm text-fg-accent">
          {`Imported ${totals.imported} · duplicates ${totals.duplicates} · refused ${totals.refused}`}
        </p>
      ) : null}
      {problems.length > 0 ? (
        <ul
          className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-status-loss"
          aria-label="Refused games"
        >
          {problems.slice(0, 50).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
