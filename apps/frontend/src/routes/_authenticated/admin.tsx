import { useState } from 'react'
import { createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import type { DeadLetter, ProjectionGroup } from '#/lib/admin'
import type { CursorPage } from '#/lib/play'
import { PROJECTION_GROUPS, isAdmin, isProjectionGroup } from '#/lib/admin'
import { useLoadMore } from '#/lib/play'
import { getDeadLetters, postReplayDeadLetters } from '#/lib/server/api'
import { Chip, LoadMore, SectionHeading } from '#/components/ui'
import { DeadLetterList } from '#/components/admin'

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
    // A fresh load (a replay, another filter) starts the pager over.
    loadedAt: Date.now(),
  }),
  component: AdminPage,
})

function AdminPage() {
  const { page, loadedAt } = Route.useLoaderData()
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
      <SectionHeading size="xl">Dead letters</SectionHeading>
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
