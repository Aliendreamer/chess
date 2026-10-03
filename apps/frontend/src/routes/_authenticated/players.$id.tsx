import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useLoadMore } from '#/lib/play'
import { getMyPractice, getMyTraining, getPlayer, getPlayerGames } from '#/lib/server/api'
import { LoadMore, Panel, SectionHeading } from '#/components/ui'
import { RecentGames } from '#/components/games'
import { PlayerStats } from '#/components/players'
import { TrainedFamilies } from '#/components/trainer'
import { pageTitle } from '#/lib/feedback'

const PAGE = 20

/** A player's public profile: name, member since, record by game type, and their games (player-profiles). */
export const Route = createFileRoute('/_authenticated/players/$id')({
  loader: async ({ params, context }) => {
    const id = Number(params.id)
    if (!Number.isSafeInteger(id) || id === 0) throw notFound()
    // Training progress is the member's own: only their own profile shows it (opening-trainer).
    const own = id === context.me.id
    const [player, games, training, practice] = await Promise.all([
      getPlayer({ data: id }),
      getPlayerGames({ data: { id, limit: PAGE } }),
      own ? getMyTraining() : null,
      own ? getMyPractice() : null,
    ])
    if (!player) throw notFound()
    return { player, games, training, practice }
  },
  head: ({ loaderData }) => ({ meta: [{ title: pageTitle(loaderData?.player.name ?? 'Player') }] }),
  component: PlayerPage,
})

const SINCE = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function PlayerPage() {
  const { player, games, training, practice } = Route.useLoaderData()
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
      {training ? (
        <Panel variant="outlined" title="Openings trained" testId="player-training">
          <TrainedFamilies families={training} />
        </Panel>
      ) : null}
      {practice ? (
        <Panel variant="outlined" title="Practice" testId="player-practice">
          <p className="m-0 text-sm text-fg-primary">
            {`${practice.positions} ${practice.positions === 1 ? 'mistake' : 'mistakes'} from your games · ${practice.learned} learned · ${practice.due} due`}{' '}
            <Link to="/practice" className="text-fg-accent">
              Practise
            </Link>
          </p>
        </Panel>
      ) : null}
      <section className="flex flex-col gap-3.5">
        <SectionHeading>Games</SectionHeading>
        <RecentGames games={pager.items} />
        <LoadMore pager={pager} />
      </section>
    </div>
  )
}
