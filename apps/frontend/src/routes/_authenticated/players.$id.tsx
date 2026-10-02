import { createFileRoute, notFound } from '@tanstack/react-router'
import { useLoadMore } from '#/lib/play'
import { getPlayer, getPlayerGames } from '#/lib/server/api'
import { LoadMore, Panel, SectionHeading } from '#/components/ui'
import { RecentGames } from '#/components/games'
import { PlayerStats } from '#/components/players'

const PAGE = 20

/** A player's public profile: name, member since, record by game type, and their games (player-profiles). */
export const Route = createFileRoute('/_authenticated/players/$id')({
  loader: async ({ params }) => {
    const id = Number(params.id)
    if (!Number.isSafeInteger(id) || id === 0) throw notFound()
    const [player, games] = await Promise.all([
      getPlayer({ data: id }),
      getPlayerGames({ data: { id, limit: PAGE } }),
    ])
    if (!player) throw notFound()
    return { player, games }
  },
  component: PlayerPage,
})

const SINCE = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function PlayerPage() {
  const { player, games } = Route.useLoaderData()
  const pager = useLoadMore(games, (cursor) =>
    getPlayerGames({ data: { id: player.id, limit: PAGE, cursor } }),
  )
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <SectionHeading size="xl">{player.name}</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          {player.isComputer
            ? 'The computer · Stockfish 19'
            : `Member since ${SINCE.format(new Date(player.memberSince))}`}
        </p>
      </header>
      <Panel variant="filled" title="Record" testId="player-record">
        <PlayerStats record={player} />
      </Panel>
      <section className="flex flex-col gap-3.5">
        <SectionHeading>Games</SectionHeading>
        <RecentGames games={pager.items} />
        <LoadMore pager={pager} />
      </section>
    </div>
  )
}
