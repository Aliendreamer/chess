import { useMemo, useState } from 'react'
import { createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { Chip, LoadMore, SectionHeading, publishedMonths, useBroadcastRuns } from '@chess/ui'
import type { DeadLetter, ProjectionGroup } from '#/lib/admin'
import type { CursorPage } from '#/lib/play'
import type { BroadcastRun } from '@chess/ui'
import { PROJECTION_GROUPS, isAdmin, isProjectionGroup } from '#/lib/admin'
import { useLoadMore } from '#/lib/play'
import {
  getAdminMembers,
  getBroadcastRuns,
  getDeadLetters,
  postCreateMember,
  postImportLibrary,
  postMemberAction,
  postReplayDeadLetters,
  postResetMemberPassword,
  postStartBroadcastImport,
} from '#/lib/server/api'
import {
  AdminMembers,
  BroadcastImportForm,
  DeadLetterList,
  LibraryImportForm,
} from '#/components/admin'
import { pageTitle } from '#/lib/feedback'

const PAGE = 50

/** Parked projection records for admins (admin-screens); anyone else gets the not-found page. */
export const Route = createFileRoute('/_authenticated/admin')({
  validateSearch: (search: Record<string, unknown>): { group?: ProjectionGroup } => {
    const group = search['group']
    return typeof group === 'string' && isProjectionGroup(group) ? { group } : {}
  },
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.me)) throw notFound()
  },
  loaderDeps: ({ search }) => ({ group: search.group }),
  loader: async ({ deps }) => ({
    page: await getDeadLetters({
      data: { limit: PAGE, ...(deps.group ? { groupId: deps.group } : {}) },
    }),
    broadcastRuns: await getBroadcastRuns(),
    members: await getAdminMembers(),
    // A fresh load (a replay, another filter) starts the pager over.
    loadedAt: Date.now(),
  }),
  head: () => ({ meta: [{ title: pageTitle('Admin') }] }),
  component: AdminPage,
})

function AdminPage() {
  const { page, loadedAt, broadcastRuns, members } = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  const { group } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [notice, setNotice] = useState<string | null>(null)

  async function replay(groupId: string, aggregateId: string) {
    const outcome = await postReplayDeadLetters({ data: { groupId, aggregateId } })
    setNotice(
      outcome.ok
        ? `Replayed ${outcome.applied} for ${groupId} ${aggregateId}.`
        : `${groupId} ${aggregateId} failed again: ${outcome.error}`,
    )
    await router.invalidate()
    return outcome
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">Admin</SectionHeading>

      <section className="flex flex-col gap-3.5" aria-label="Members">
        <SectionHeading>Members</SectionHeading>
        <p className="m-0 max-w-prose text-sm text-fg-secondary">
          Members join by invitation: create one here and hand them the temporary password. A
          deactivated member is signed out at once and cannot sign in; their games stay.
        </p>
        <AdminMembers
          members={members}
          meId={me.id}
          onCreate={(member) => postCreateMember({ data: member })}
          onAction={(id, action) => postMemberAction({ data: { id, action } })}
          onResetPassword={(id) => postResetMemberPassword({ data: id })}
        />
      </section>

      <section className="flex flex-col gap-3.5" aria-label="Game library">
        <SectionHeading>Game library</SectionHeading>
        <p className="m-0 max-w-prose text-sm text-fg-secondary">
          Import famous games from PGN. Name where they come from and under which terms: every game
          shows it. Only moves and factual headers are kept, never annotations.
        </p>
        <LibraryImportForm onImport={(batch) => postImportLibrary({ data: batch })} />
      </section>

      <section className="flex flex-col gap-3.5" aria-label="Lichess broadcasts">
        <SectionHeading>Lichess broadcasts</SectionHeading>
        <p className="m-0 max-w-prose text-sm text-fg-secondary">
          Import a month of the lichess broadcast games (CC BY-SA 4.0) for the explorer: finished
          standard games with both players rated 2400 or more, no blitz or bullet, indexed for their
          first 20 moves. One month at a time; running a month again adds only what is missing.
        </p>
        <Broadcasts initial={broadcastRuns} />
      </section>

      <SectionHeading>Dead letters</SectionHeading>
      <p className="m-0 max-w-prose text-sm text-fg-secondary">
        Records a projection could not apply after its retries. Each one quarantines its aggregate
        for that projection until it is replayed.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Projection">
        <Chip selected={!group} onClick={() => void navigate({ to: '/admin', search: {} })}>
          All
        </Chip>
        {PROJECTION_GROUPS.map((g) => (
          <Chip
            key={g}
            mono
            selected={group === g}
            onClick={() => void navigate({ to: '/admin', search: { group: g } })}
          >
            {g.replace(/^chess\./, '')}
          </Chip>
        ))}
      </div>
      {notice ? (
        <p role="status" className="m-0 text-sm text-fg-accent" data-testid="replay-notice">
          {notice}
        </p>
      ) : null}
      <Letters key={loadedAt} first={page} group={group} onReplay={replay} />
    </div>
  )
}

function Letters({
  first,
  group,
  onReplay,
}: {
  first: CursorPage<DeadLetter>
  group: ProjectionGroup | undefined
  onReplay: Parameters<typeof DeadLetterList>[0]['onReplay']
}) {
  const pager = useLoadMore(first, (cursor) =>
    getDeadLetters({ data: { limit: PAGE, cursor, ...(group ? { groupId: group } : {}) } }),
  )
  return (
    <>
      <DeadLetterList letters={pager.items} onReplay={onReplay} />
      <LoadMore pager={pager} />
    </>
  )
}

const loadRuns = () => getBroadcastRuns()

function Broadcasts({ initial }: { initial: Array<BroadcastRun> }) {
  const { runs, refresh } = useBroadcastRuns(initial, loadRuns)
  const months = useMemo(() => publishedMonths(new Date()), [])
  return (
    <BroadcastImportForm
      months={months}
      runs={runs}
      onStart={async (month) => {
        const outcome = await postStartBroadcastImport({ data: month })
        if (outcome.ok) await refresh()
        return outcome
      }}
    />
  )
}
