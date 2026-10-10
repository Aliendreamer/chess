import { createFileRoute, notFound } from '@tanstack/react-router'
import { useLoadMore } from '#/lib/play'
import { getMyTraining, getPlayer, getPlayerGames, getTrainingSummary } from '#/lib/server/api'
import { LoadMore, Panel, SectionHeading } from '#/components/ui'
import { RecentGames } from '#/components/games'
import { PlayerStats } from '#/components/players'
import { TrainedFamilies } from '#/components/trainer'
import { TrainingCounts } from '#/components/training'
import { pageTitle } from '#/lib/feedback'

const PAGE = 20

/** A player's public profile: name, member since, record by game type, and their games (player-profiles). */
export const Route = createFileRoute('/_authenticated/players/$id')({
  loader: async ({ params, context }) => {
    const id = Number(params.id)
    if (!Number.isSafeInteger(id) || id === 0) throw notFound()
    // Training progress is the member's own: only their own profile shows it (opening-trainer, training).
    const own = id === context.me.id
    const [player, games, training, sessions] = await Promise.all([
      getPlayer({ data: id }),
      getPlayerGames({ data: { id, limit: PAGE } }),
      own ? getMyTraining() : null,
      own ? getTrainingSummary() : null,
    ])
    if (!player) throw notFound()
    return { player, games, training, sessions }
  },
  head: ({ loaderData }) => ({ meta: [{ title: pageTitle(loaderData?.player.name ?? 'Player') }] }),
  component: PlayerPage,
})

const SINCE = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function PlayerPage() {
  const { player, games, training, sessions } = Route.useLoaderData()
  const pager = useLoadMore(games, (cursor) =>
    getPlayerGames({ data: { id: player.id, limit: PAGE, cursor } }),
  )
  return (
    // Fills the screen on a wide one (data-layout): the record and training on the left, the games scrolling beside.
    <div
      className="grid grid-cols-1 items-start gap-x-8 gap-y-6 xl:h-full xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] xl:grid-rows-[auto_minmax(0,1fr)]"
      data-layout="wide fill"
    >
      <header className="flex flex-col gap-1 xl:col-span-2">
        <SectionHeading size="xl">{player.name}</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          {player.isComputer
            ? 'The computer · Stockfish 19'
            : `Member since ${SINCE.format(new Date(player.memberSince))}`}
        </p>
      </header>
      <div className="flex min-w-0 flex-col gap-6 xl:max-h-full xl:overflow-y-auto">
        <Panel variant="filled" title="Record" testId="player-record">
          <PlayerStats record={player} />
        </Panel>
        {training ? (
          <Panel variant="outlined" title="Openings trained" testId="player-training">
            <TrainedFamilies families={training} />
          </Panel>
        ) : null}
        {sessions ? (
          <Panel variant="outlined" title="Training" testId="player-sessions">
            <TrainingCounts summary={sessions} />
          </Panel>
        ) : null}
      </div>
      <section className="flex min-w-0 flex-col gap-3.5 xl:max-h-full xl:min-h-0">
        <SectionHeading>Games</SectionHeading>
        <div className="flex flex-col gap-3.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <RecentGames games={pager.items} />
          <LoadMore pager={pager} />
        </div>
      </section>
    </div>
  )
}
