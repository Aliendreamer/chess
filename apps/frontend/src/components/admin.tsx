import { useState } from 'react'
import { Copy } from 'lucide-react'
import { parsePgn } from '@chess/core'
import type {
  AdminMember,
  CreatedMember,
  DeadLetter,
  MemberAction,
  NewMember,
  ReplayOutcome,
} from '#/lib/admin'
import type { BroadcastRun, ImportAnswer, ImportBatch, ImportGame } from '#/lib/library'
import type { CommandOutcome } from '#/lib/games'
import { IMPORT_BATCH, batches, toImportGame } from '#/lib/library'
import { checkNewMember, firstLine, isSelfHarm } from '#/lib/admin'
import { lastSeenText, useNow } from '#/lib/members'
import { Button, ErrorText, Panel, buttonClass, useAdoptTyped, useCommand } from '#/components/ui'

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
    if (games.length === 0) {
      setError('No PGN game was found in that text.')
      setProblems(found)
      setBusy(false)
      return
    }
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

const COUNT = new Intl.NumberFormat('en-GB')

/**
 * A month of lichess broadcasts into the library (broadcast-explorer D1): pick a published month, start it, and follow
 * the runs. The server streams the month's file; nothing is uploaded from here.
 */
export function BroadcastImportForm({
  months,
  runs,
  onStart,
}: {
  months: ReadonlyArray<string>
  runs: ReadonlyArray<BroadcastRun>
  onStart: (month: string) => Promise<CommandOutcome<{ runId: string }>>
}) {
  const [month, setMonth] = useState(months[0] ?? '')
  const command = useCommand()
  return (
    <div className="flex flex-col gap-3" data-testid="broadcast-import">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-control border border-line-default bg-surface-inset px-3 py-2 font-mono text-fg-primary"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={command.busy || !month}
          onClick={() => void command.run(() => onStart(month))}
        >
          Import the month
        </Button>
      </div>
      {command.error ? <ErrorText>{command.error}</ErrorText> : null}
      {runs.length === 0 ? (
        <p className="m-0 text-sm text-fg-secondary">No month imported yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Broadcast imports">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
                <th className="py-1 pr-3 font-medium">Month</th>
                <th className="py-1 pr-3 font-medium">State</th>
                <th className="py-1 pr-3 text-right font-medium">Read</th>
                <th className="py-1 pr-3 text-right font-medium">Kept</th>
                <th className="py-1 pr-3 text-right font-medium">Imported</th>
                <th className="py-1 pr-3 text-right font-medium">Already there</th>
                <th className="py-1 text-right font-medium">Refused</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line-divider align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-mono font-normal">
                    {r.month}
                  </th>
                  <td className="py-1.5 pr-3">
                    <span className={r.state === 'failed' ? 'text-status-loss' : 'text-fg-body'}>
                      {r.state}
                    </span>
                    {r.error ? (
                      <span className="block text-2xs text-fg-secondary">{r.error}</span>
                    ) : null}
                  </td>
                  {[r.read, r.kept, r.imported, r.duplicate, r.refused].map((n, i) => (
                    <td key={i} className="py-1.5 pr-3 text-right font-mono text-fg-secondary">
                      {COUNT.format(n)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const FIELD =
  'rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary pointer-coarse:min-h-11'

export interface AdminMembersProps {
  members: ReadonlyArray<AdminMember>
  meId: number
  onCreate: (member: NewMember) => Promise<CommandOutcome<CreatedMember>>
  onAction: (
    id: number,
    action: Exclude<MemberAction, 'reset-password'>,
  ) => Promise<CommandOutcome<AdminMember>>
  onResetPassword: (id: number) => Promise<CommandOutcome<{ temporaryPassword: string }>>
}

/**
 * Member admin (member-admin): create a member (their temporary password shown once), and per member deactivate or
 * reactivate, reset the password, grant or remove Admin. Your own row cannot be deactivated or lose its role.
 */
export function AdminMembers({
  members,
  meId,
  onCreate,
  onAction,
  onResetPassword,
}: AdminMembersProps) {
  const [list, setList] = useState<Array<AdminMember>>(() => [...members])
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)
  const now = useNow(60_000)

  function replace(member: AdminMember) {
    setList((prev) => prev.map((m) => (m.id === member.id ? member : m)))
  }

  return (
    <div className="flex flex-col gap-4">
      <CreateMemberForm
        onCreate={async (input) => {
          const outcome = await onCreate(input)
          if (outcome.ok) {
            setList((prev) => [
              outcome.view.member,
              ...prev.filter((m) => m.id !== outcome.view.member.id),
            ])
            setCreated({
              username: outcome.view.member.username,
              password: outcome.view.temporaryPassword,
            })
          }
          return outcome
        }}
      />
      {created ? (
        <OneTimePassword
          username={created.username}
          password={created.password}
          onDone={() => setCreated(null)}
        />
      ) : null}
      {list.length === 0 ? (
        <p className="m-0 text-sm text-fg-secondary">No members yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0" data-testid="admin-members">
          {list.map((member) => (
            <AdminMemberRow
              key={member.id}
              member={member}
              meId={meId}
              now={now}
              onAction={async (action) => {
                const outcome = await onAction(member.id, action)
                if (outcome.ok) replace(outcome.view)
                return outcome
              }}
              onResetPassword={() => onResetPassword(member.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateMemberForm({
  onCreate,
}: {
  onCreate: (member: NewMember) => Promise<CommandOutcome<CreatedMember>>
}) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  const command = useCommand()
  const usernameField = useAdoptTyped<HTMLInputElement>(setUsername)
  const fullNameField = useAdoptTyped<HTMLInputElement>(setFullName)
  const emailField = useAdoptTyped<HTMLInputElement>(setEmail)

  async function create() {
    const checked = checkNewMember({ username, fullName, email })
    if (!checked.ok) {
      setInvalid(checked.error)
      return
    }
    setInvalid(null)
    const done = await command.run(() => onCreate(checked.member))
    if (done) {
      setUsername('')
      setFullName('')
      setEmail('')
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      aria-label="New member"
      onSubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          Username
          <input
            ref={usernameField}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={64}
            autoComplete="off"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          Full name
          <input
            ref={fullNameField}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            autoComplete="off"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          E-mail (optional)
          <input
            ref={emailField}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="off"
            className={FIELD}
          />
        </label>
      </div>
      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={command.busy || !username.trim() || !fullName.trim()}
        >
          {command.busy ? 'Creating…' : 'Create member'}
        </Button>
      </div>
      {(invalid ?? command.error) ? <ErrorText>{invalid ?? command.error}</ErrorText> : null}
    </form>
  )
}

/** A temporary password, shown this once: nothing keeps it. */
export function OneTimePassword({
  username,
  password,
  onDone,
}: {
  username: string
  password: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Panel
      variant="accent"
      title="Temporary password"
      testId="temporary-password"
      className="gap-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <code
          className="rounded-control bg-surface-inset px-3 py-2 font-mono text-base text-fg-primary select-all"
          data-testid="temporary-password-value"
        >
          {password}
        </code>
        <Button
          size="sm"
          onClick={() => {
            // No clipboard outside a secure context: the password stays selectable.
            if (!('clipboard' in navigator)) return
            void navigator.clipboard
              .writeText(password)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }}
        >
          <Copy aria-hidden size={14} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
      <p className="m-0 text-sm text-fg-secondary">
        {`Give this to ${username}; they choose their own at first sign-in.`}
      </p>
    </Panel>
  )
}

function Badge({ tone, children }: { tone: 'good' | 'off' | 'accent'; children: string }) {
  const tones = {
    good: 'border-line-default text-status-healthy',
    off: 'border-line-default text-status-loss',
    accent: 'border-line-accent text-fg-accent',
  } as const
  return (
    <span
      className={`rounded-pill border px-2 py-0.5 text-2xs tracking-wide uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

function AdminMemberRow({
  member,
  meId,
  now,
  onAction,
  onResetPassword,
}: {
  member: AdminMember
  meId: number
  now: number
  onAction: (
    action: Exclude<MemberAction, 'reset-password'>,
  ) => Promise<CommandOutcome<AdminMember>>
  onResetPassword: () => Promise<CommandOutcome<{ temporaryPassword: string }>>
}) {
  const command = useCommand()
  const [password, setPassword] = useState<string | null>(null)
  const self = member.id === meId
  const activation = member.active ? 'deactivate' : 'reactivate'
  const role = member.admin ? 'remove-admin' : 'make-admin'

  async function reset() {
    const answer = await command.run(onResetPassword)
    if (answer) setPassword(answer.temporaryPassword)
  }

  return (
    <li
      className="flex flex-col gap-2 border-b border-line-divider py-3"
      data-testid="admin-member"
      data-member={member.username}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium text-fg-primary">{member.username}</span>
          {member.fullName ? (
            <span className="text-sm text-fg-secondary">{member.fullName}</span>
          ) : null}
          {member.email ? <span className="text-xs text-fg-muted">{member.email}</span> : null}
          {self ? <span className="text-xs text-fg-muted">(you)</span> : null}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {member.active ? (
            <Badge tone="good">Active</Badge>
          ) : (
            <Badge tone="off">Deactivated</Badge>
          )}
          {member.admin ? <Badge tone="accent">Admin</Badge> : null}
          <span className="text-xs text-fg-muted" suppressHydrationWarning>
            {lastSeenText(member.lastSeenAt, now)}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={command.busy || isSelfHarm(activation, member, meId)}
          aria-label={`${member.active ? 'Deactivate' : 'Reactivate'} ${member.username}`}
          onClick={() => void command.run(() => onAction(activation))}
        >
          {member.active ? 'Deactivate' : 'Reactivate'}
        </Button>
        <Button
          size="sm"
          disabled={command.busy}
          aria-label={`Reset ${member.username}'s password`}
          onClick={() => void reset()}
        >
          Reset password
        </Button>
        <Button
          size="sm"
          disabled={command.busy || isSelfHarm(role, member, meId)}
          aria-label={
            member.admin
              ? `Remove admin from ${member.username}`
              : `Make ${member.username} an admin`
          }
          onClick={() => void command.run(() => onAction(role))}
        >
          {member.admin ? 'Remove admin' : 'Make admin'}
        </Button>
      </div>
      {command.error ? <ErrorText>{command.error}</ErrorText> : null}
      {password ? (
        <OneTimePassword
          username={member.username}
          password={password}
          onDone={() => setPassword(null)}
        />
      ) : null}
    </li>
  )
}
