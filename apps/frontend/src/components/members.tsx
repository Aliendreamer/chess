import { Swords } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ColourChoice } from '#/lib/games'
import type { Challenge, ChallengeState, Member, MemberState } from '#/lib/members'
import {
  canChallenge,
  challengeText,
  countdownText,
  gameTypeText,
  lastSeenText,
  secondsLeft,
  stateText,
} from '#/lib/members'
import { PRESETS, categoryOf } from '#/lib/games'
import { Button, Chip, ColourPicker, ErrorText, Panel } from '#/components/ui'
import { CategoryDot, PlayerLink } from '#/components/games'

/**
 * Club members (club-members, challenges): the members list with each one's state, the challenge form and my
 * challenge while it waits, and the banner that shows challenges to me on every page.
 */

// Static class strings per state, so Tailwind sees them. The text label always goes with the dot.
const STATE_DOT: Record<MemberState, string> = {
  online: 'bg-status-healthy',
  playing: 'bg-status-turn',
  offline: 'bg-status-waiting',
}

export function StateDot({ state }: { state: MemberState }) {
  return (
    <span
      aria-hidden
      data-state={state}
      className={`inline-block size-2.5 shrink-0 rounded-full ${STATE_DOT[state]}`}
    />
  )
}

export interface MemberListProps {
  members: ReadonlyArray<Member>
  meId: number
  presenceKnown: boolean
  now: number
  /** False while a challenge of mine is out: one at a time. */
  mayChallenge: boolean
  /** The member whose challenge form is open, and the form itself (rendered under their row). */
  openFor: number | null
  panel?: ReactNode
  onChallenge: (member: Member) => void
}

/** Every active member: state (dot and word), name to the profile, last seen when offline, and Challenge. */
export function MemberList({
  members,
  meId,
  presenceKnown,
  now,
  mayChallenge,
  openFor,
  panel,
  onChallenge,
}: MemberListProps) {
  if (members.length === 0) return <p className="m-0 text-sm text-fg-secondary">No members yet.</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="members">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex flex-col gap-3 border-b border-line-divider py-2.5"
          data-testid="member-row"
          data-member={member.username}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <StateDot state={member.state} />
              <PlayerLink
                id={member.id}
                name={member.username}
                className="truncate font-medium text-fg-primary no-underline hover:text-fg-accent hover:underline"
              />
              {member.id === meId ? <span className="text-xs text-fg-muted">(you)</span> : null}
            </span>
            <span className="text-sm text-fg-secondary" data-testid="member-state">
              {presenceKnown ? stateText(member.state) : 'Unknown'}
            </span>
            {member.state === 'offline' ? (
              <span className="text-xs text-fg-muted" suppressHydrationWarning>
                {lastSeenText(member.lastSeenAt, now)}
              </span>
            ) : null}
            {canChallenge(member, meId, presenceKnown) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!mayChallenge}
                aria-expanded={openFor === member.id}
                aria-label={`Challenge ${member.username}`}
                onClick={() => onChallenge(member)}
              >
                <Swords aria-hidden size={14} />
                Challenge
              </Button>
            ) : null}
          </div>
          {openFor === member.id ? panel : null}
        </li>
      ))}
    </ul>
  )
}

export interface ChallengeFormProps {
  opponent: string
  timeControl: string
  color: ColourChoice
  busy: boolean
  error: string | null
  onTimeControl: (tc: string) => void
  onColor: (color: ColourChoice) => void
  onSend: () => void
  onClose: () => void
}

/** The challenge form under a member's row: a preset, my colour, Send. */
export function ChallengeForm({
  opponent,
  timeControl,
  color,
  busy,
  error,
  onTimeControl,
  onColor,
  onSend,
  onClose,
}: ChallengeFormProps) {
  return (
    <Panel
      variant="outlined"
      title={`Challenge ${opponent}`}
      testId="challenge-form"
      className="gap-3"
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Game type">
        {PRESETS.map((tc) => (
          <Chip key={tc} mono selected={tc === timeControl} onClick={() => onTimeControl(tc)}>
            <span className="flex items-center gap-1.5">
              <CategoryDot category={categoryOf(tc)} />
              {tc}
            </span>
          </Chip>
        ))}
      </div>
      <p className="m-0 text-sm text-fg-secondary">{gameTypeText(timeControl)}</p>
      <ColourPicker value={color} onChange={onColor} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={onSend}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
        <Button disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
      {error ? <ErrorText testId="challenge-error">{error}</ErrorText> : null}
    </Panel>
  )
}

export interface ChallengeStatusProps {
  opponent: string
  state: ChallengeState
  now: number
  busy: boolean
  error: string | null
  onCancel: () => void
  onDismiss: () => void
}

/** My challenge: waiting with a countdown and Cancel, then how it ended. */
export function ChallengeStatus({
  opponent,
  state,
  now,
  busy,
  error,
  onCancel,
  onDismiss,
}: ChallengeStatusProps) {
  return (
    <Panel variant="accent" testId="challenge-status" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0" aria-live="polite">
          {state.kind === 'waiting' ? (
            <>
              {`Waiting for ${opponent}… `}
              <span className="font-mono" data-testid="challenge-countdown">
                {countdownText(secondsLeft(state.expiresAt, now))}
              </span>
            </>
          ) : state.kind === 'declined' ? (
            `${opponent} declined.`
          ) : state.kind === 'expired' ? (
            `No answer from ${opponent}.`
          ) : state.kind === 'started' ? (
            `${opponent} accepted. Opening the game…`
          ) : (
            'Challenge cancelled.'
          )}
        </p>
        {state.kind === 'waiting' ? (
          <Button size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        ) : state.kind !== 'started' ? (
          <Button size="sm" onClick={onDismiss}>
            OK
          </Button>
        ) : null}
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Panel>
  )
}

export interface ChallengeBannerProps {
  /** Open challenges to me, expired ones already left out. */
  challenges: ReadonlyArray<Challenge>
  now: number
  busy: boolean
  error: string | null
  onAccept: (challenge: Challenge) => void
  onDecline: (challenge: Challenge) => void
}

/** Challenges to me, fixed at the top of every page with their countdown, Accept and Decline. */
export function ChallengeBanner({
  challenges,
  now,
  busy,
  error,
  onAccept,
  onDecline,
}: ChallengeBannerProps) {
  if (challenges.length === 0 && !error) return null
  return (
    <section
      aria-label="Challenges"
      data-testid="challenge-banner"
      className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center px-4 shell:top-4"
    >
      <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-2">
        {challenges.map((c) => (
          <div
            key={c.inviteId}
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-card border border-line-accent bg-surface-raised px-4 py-3 shadow-2xl"
          >
            <Swords aria-hidden size={18} className="text-fg-accent" />
            <span className="min-w-0 flex-1 text-sm text-fg-primary">{challengeText(c)}</span>
            <span className="font-mono text-sm text-fg-secondary" aria-label="Seconds left">
              {countdownText(secondsLeft(c.expiresAt, now))}
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                aria-label={`Accept ${c.from}'s challenge`}
                onClick={() => onAccept(c)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                disabled={busy}
                aria-label={`Decline ${c.from}'s challenge`}
                onClick={() => onDecline(c)}
              >
                Decline
              </Button>
            </span>
          </div>
        ))}
        {error ? (
          <div className="rounded-card border border-line-default bg-surface-raised px-4 py-2">
            <ErrorText>{error}</ErrorText>
          </div>
        ) : null}
      </div>
    </section>
  )
}
