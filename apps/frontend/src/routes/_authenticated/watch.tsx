import { createFileRoute } from '@tanstack/react-router'
import { toTvGame, useLoadMore } from '#/lib/play'
import { getLiveGames } from '#/lib/server/api'
import { LoadMore, SectionHeading } from '#/components/ui'
import { TvGrid } from '#/components/games'

const PAGE = 24

/** Every game in play, newest move first, each opening for a spectator (live-home; D20). */
export const Route = createFileRoute('/_authenticated/watch')({
  loader: () => getLiveGames({ data: { limit: PAGE } }),
  component: WatchPage,
})

const nextPage = (cursor: string) => getLiveGames({ data: { limit: PAGE, cursor } })

function WatchPage() {
  const pager = useLoadMore(Route.useLoaderData(), nextPage)
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">Watch</SectionHeading>
      <TvGrid games={pager.items.map(toTvGame)} empty="No games in play right now." />
      <LoadMore pager={pager} />
    </div>
  )
}
