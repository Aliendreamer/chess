import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import type { InviteView } from '#/lib/play'
import type { LiveFrame } from '#/lib/live'
import type { Me } from '#/lib/server/api-loaders'
import { getInvite, postAcceptInvite, postCancelInvite } from '#/lib/server/api'
import { category, topicId } from '#/lib/games'
import { guestColor, isInviteView } from '#/lib/play'
import { useLiveTopic } from '#/lib/useLiveTopic'
import { Button } from '#/components/core/Button'
import { Panel, SectionHeading } from '#/components/core/Panel'

/**
 * An invite link (D7). The creator shares it and waits; anyone else signed in can accept. The `invite:{id}` frame
 * moves both to the game the moment it is accepted. Anonymous visitors reach here through the login bounce.
 */
export const Route = createFileRoute('/_authenticated/invites/$id')({
  loader: ({ params }) => getInvite({ data: params.id }),
  component: InvitePage,
})

function InvitePage() {
  const { id } = Route.useParams()
  const { me } = Route.useRouteContext()
  const invite = Route.useLoaderData()
  if (!invite) {
    return (
      <Panel variant="filled" className="max-w-xl gap-3 p-6">
        <SectionHeading size="xl">No such invite</SectionHeading>
        <p className="m-0 text-fg-body">The link is wrong, or the invite no longer exists.</p>
        <Link to="/">Back home</Link>
      </Panel>
    )
  }
  return <Invite key={id} me={me} loaded={invite} />
}

const STATUS_TEXT: Record<InviteView['status'], string> = {
  open: 'Waiting for someone to accept.',
  accepted: 'Accepted — the game has started.',
  cancelled: 'This invite was cancelled.',
  expired: 'This invite has expired.',
}

function Invite({ me, loaded }: { me: Me; loaded: InviteView }) {
  const navigate = useNavigate()
  const topic = topicId(loaded.inviteId)
  const initial = useMemo<LiveFrame<InviteView>>(
    () => ({ topic: `invite:${topic}`, seq: loaded.seq, payload: loaded }),
    [topic, loaded],
  )
  const live = useLiveTopic({ kind: 'invite', id: topic, initial, isPayload: isInviteView })
  const invite = live.frame?.payload ?? loaded
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const gone = useRef(false)
  const isCreator = invite.creatorId === me.id

  // Accepted (by anyone, seen by either side): off to the game.
  useEffect(() => {
    if (invite.status === 'accepted' && invite.gameId && !gone.current) {
      gone.current = true
      void navigate({ to: '/games/$id', params: { id: invite.gameId } })
    }
  }, [invite.status, invite.gameId, navigate])

  // The shareable URL needs the page's origin, which only the browser knows (no API host is ever involved).
  useEffect(() => {
    setLink(`${window.location.origin}/invites/${topic}`)
  }, [topic])

  async function act(kind: 'accept' | 'cancel') {
    setBusy(true)
    setError(null)
    try {
      const outcome = await (kind === 'accept' ? postAcceptInvite : postCancelInvite)({
        data: loaded.inviteId,
      })
      if (!outcome.ok) {
        setError(outcome.error)
      } else if (outcome.view.status === 'accepted' && outcome.view.gameId && !gone.current) {
        gone.current = true
        void navigate({ to: '/games/$id', params: { id: outcome.view.gameId } })
      }
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  const yourColour = isCreator ? invite.color : guestColor(invite.color)
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <div className="text-sm text-fg-secondary">{`${category(invite.timeControl)} · ${invite.timeControl}`}</div>
        <SectionHeading size="xl" className="mt-1">
          {isCreator ? 'Your invite' : 'You are invited to a game'}
        </SectionHeading>
      </header>

      <Panel variant="accent" title="Invite" meta={invite.status}>
        <p className="m-0 text-fg-body" data-testid="invite-status">
          {!isCreator && invite.status === 'open'
            ? 'Accept to start the game.'
            : STATUS_TEXT[invite.status]}
        </p>
        <p className="m-0 text-sm text-fg-secondary">
          {yourColour === 'random'
            ? 'Colours are drawn when the game starts.'
            : `You play ${yourColour}.`}
        </p>

        {isCreator && invite.status === 'open' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code
                className="flex-1 truncate rounded-control bg-surface-inset px-3 py-2 font-mono text-sm text-fg-primary"
                data-testid="invite-link"
              >
                {link ?? `/invites/${topic}`}
              </code>
              <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>
            </div>
            <div>
              <Button disabled={busy} onClick={() => void act('cancel')}>
                Cancel invite
              </Button>
            </div>
          </div>
        ) : null}

        {!isCreator && invite.status === 'open' ? (
          <div>
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void act('accept')}>
              Accept and play
            </Button>
          </div>
        ) : null}
      </Panel>

      {error ? (
        <p role="status" className="m-0 text-sm text-status-loss">
          {error}
        </p>
      ) : null}
    </div>
  )
}
