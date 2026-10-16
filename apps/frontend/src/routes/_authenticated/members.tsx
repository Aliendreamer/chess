import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SectionHeading, useCommand } from '@chess/ui'
import type { ColourChoice } from '@chess/core'
import type { InviteView } from '#/lib/play'
import type { Member, MembersView } from '#/lib/members'
import { getMembers, postChallenge, postChallengeAnswer } from '#/lib/server/api'
import { liveStatusText, useLiveTopic } from '#/lib/live'
import { topicId } from '#/lib/games'
import { isInviteView } from '#/lib/play'
import { challengeState, isMembersView, sortMembers, useNow } from '#/lib/members'
import { pageTitle } from '#/lib/feedback'
import { ChallengeForm, ChallengeStatus, MemberList } from '#/components/members'

/** Who is in the club and online, and a challenge to one of them (club-members, challenges). */
export const Route = createFileRoute('/_authenticated/members')({
  loader: () => getMembers(),
  head: () => ({ meta: [{ title: pageTitle('Members') }] }),
  component: MembersPage,
})

/** My challenge while it is out: who to, and the invite as last seen (the POST's answer, then its frames). */
interface Out {
  opponent: Member
  invite: InviteView
}

function MembersPage() {
  const loaded = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  const navigate = useNavigate()
  // The list replaces itself with every `members` frame; the loader's answer has no seq, so any frame is newer.
  const live = useLiveTopic<MembersView>({
    kind: 'members',
    id: 'all',
    initial: { seq: loaded.seq ?? -1, payload: loaded },
    isPayload: isMembersView,
  })
  const view = live.frame?.payload ?? loaded
  const members = sortMembers(view.items)

  const [formFor, setFormFor] = useState<Member | null>(null)
  const [timeControl, setTimeControl] = useState('5+3')
  const [color, setColor] = useState<ColourChoice>('random')
  const sending = useCommand()
  const [out, setOut] = useState<Out | null>(null)

  const invite = useLiveTopic({
    kind: 'invite',
    id: out ? topicId(out.invite.inviteId) : 'none',
    initial: out ? { seq: out.invite.seq, payload: out.invite } : undefined,
    isPayload: isInviteView,
    enabled: out !== null,
  })
  // Every second while my challenge counts down; otherwise only "last seen" moves.
  const now = useNow(out ? 1000 : 30_000)
  const state = out ? challengeState(invite.frame?.payload ?? out.invite, now) : null
  const cancelling = useCommand()

  const started = state?.kind === 'started' ? state.gameId : null
  useEffect(() => {
    if (started) void navigate({ to: '/games/$id', params: { id: started } })
  }, [started])

  async function send() {
    if (!formFor) return
    const sent = await sending.run(() =>
      postChallenge({ data: { opponentId: formFor.id, timeControl, color } }),
    )
    if (!sent) return
    setOut({ opponent: formFor, invite: sent })
    setFormFor(null)
  }

  async function cancel() {
    if (!out) return
    const answer = await cancelling.run(() =>
      postChallengeAnswer({ data: { inviteId: out.invite.inviteId, answer: 'cancel' } }),
    )
    // Cancelled: back to the list. Anything else (it was accepted meanwhile) is the frame's to show.
    if (answer?.status === 'cancelled') setOut(null)
    else if (answer) setOut({ ...out, invite: answer })
  }

  const waiting = state?.kind === 'waiting'

  return (
    <div className="flex flex-col gap-5 shell:h-full" data-layout="wide fill">
      <SectionHeading
        size="xl"
        meta={<span data-testid="members-relay">{liveStatusText(live.status)}</span>}
      >
        Members
      </SectionHeading>
      {!view.presenceKnown ? (
        <p className="m-0 text-sm text-fg-secondary">
          Who is online is not known right now; the list is still the club's.
        </p>
      ) : null}
      {out && state ? (
        <ChallengeStatus
          opponent={out.opponent.username}
          state={state}
          now={now}
          busy={cancelling.busy}
          error={cancelling.error}
          onCancel={() => void cancel()}
          onDismiss={() => setOut(null)}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <MemberList
          members={members}
          meId={me.id}
          presenceKnown={view.presenceKnown}
          now={now}
          mayChallenge={!waiting}
          openFor={formFor?.id ?? null}
          onChallenge={(member) => setFormFor(formFor?.id === member.id ? null : member)}
          panel={
            formFor ? (
              <ChallengeForm
                opponent={formFor.username}
                timeControl={timeControl}
                color={color}
                busy={sending.busy}
                error={sending.error}
                onTimeControl={setTimeControl}
                onColor={setColor}
                onSend={() => void send()}
                onClose={() => setFormFor(null)}
              />
            ) : null
          }
        />
      </div>
    </div>
  )
}
