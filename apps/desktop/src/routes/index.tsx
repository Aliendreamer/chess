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
    // The page fits the window: the games and the news scroll inside their columns, never the page.
    <div className="flex h-full flex-col gap-8" data-layout="wide fill">
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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
        <section className="flex min-h-0 flex-col gap-3">
          <SectionHeading>Your games</SectionHeading>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <GameRows games={recent} />
          </div>
        </section>
        <section className="flex min-h-0 flex-col gap-6">
          {events.length > 0 ? <EventsNow events={events} /> : null}
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <SectionHeading>News</SectionHeading>
            {news.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <NewsList items={news} nowMs={Date.now()} />
              </div>
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
