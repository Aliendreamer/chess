import { createFileRoute } from '@tanstack/react-router'
import { useLoadMore } from '#/lib/play'
import { getMyGames } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import { LoadMore, SectionHeading } from '#/components/ui'
import { RecentGames } from '#/components/games'

const PAGE = 20

/** Your games, newest first, keyset-paged from the replica ("Load more" follows the cursor). */
export const Route = createFileRoute('/_authenticated/games/')({
  loader: () => getMyGames({ data: { limit: PAGE } }),
  head: () => ({ meta: [{ title: pageTitle('History') }] }),
  component: HistoryPage,
})

const nextPage = (cursor: string) => getMyGames({ data: { limit: PAGE, cursor } })

function HistoryPage() {
  const pager = useLoadMore(Route.useLoaderData(), nextPage)
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">History</SectionHeading>
      <RecentGames games={pager.items} pgn />
      <LoadMore pager={pager} />
    </div>
  )
}
