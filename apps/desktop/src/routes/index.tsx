import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EventsNow, NewsList, SectionHeading, useCommand } from '@chess/ui'
import type { ColourChoice, ThinkSeconds } from '@chess/core'
import { EngineForm, GameRows } from '#/components/play'
import { createGame, listGames } from '#/lib/data/play'
import { getSetting, setSetting } from '#/lib/data/settings'
import { currentEvents, latestNews } from '#/lib/data/news'

/** The last choices, so the next game starts where the last one did (the think time: owner, 2026-10-16). */
interface PlayChoice {
  level: string
  color: ColourChoice
  think: ThinkSeconds
}
const DEFAULT_CHOICE: PlayChoice = { level: '1600', color: 'white', think: 5 }

export const Route = createFileRoute('/')({
  loader: async ({ context: { app } }) => ({
    recent: (await listGames(app.db, 8)).items,
    choice: await getSetting(app.db, 'play.choice', DEFAULT_CHOICE),
    news: await latestNews(app.db, 8),
    events: await currentEvents(app.db, 5),
  }),
  component: Home,
})

/** Home: a game against the computer and your recent games. */
function Home() {
  const { app } = Route.useRouteContext()
  const { recent, choice, news, events } = Route.useLoaderData()
  const navigate = useNavigate()
  const [level, setLevel] = useState(choice.level)
  const [color, setColor] = useState<ColourChoice>(choice.color)
  const [think, setThink] = useState<ThinkSeconds>(choice.think)
  const starting = useCommand()

  async function start() {
    const game = await starting.run(async () => {
      await setSetting(app.db, 'play.choice', { level, color, think })
      return {
        ok: true as const,
        view: await createGame(app.db, { level, color, thinkSeconds: think }),
      }
    })
    if (game) await navigate({ to: '/games/$id', params: { id: game.id } })
  }

  return (
    <div className="flex flex-col gap-8" data-layout="wide">
      <section className="flex flex-col gap-4">
        <SectionHeading size="xl">Play the computer</SectionHeading>
        <EngineForm
          level={level}
          color={color}
          think={think}
          busy={starting.busy}
          error={starting.error}
          onLevel={setLevel}
          onColor={setColor}
          onThink={setThink}
          onStart={() => void start()}
        />
      </section>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
        <section className="flex flex-col gap-3">
          <SectionHeading>Your games</SectionHeading>
          <GameRows games={recent} />
        </section>
        <section className="flex flex-col gap-6">
          {events.length > 0 ? <EventsNow events={events} /> : null}
          <div className="flex flex-col gap-3">
            <SectionHeading>News</SectionHeading>
            {news.length > 0 ? (
              <NewsList items={news} nowMs={Date.now()} />
            ) : (
              <p className="text-sm text-fg-muted">
                The news is fetched once the computer is online.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
