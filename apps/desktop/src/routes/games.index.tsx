import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LoadMore, SectionHeading } from '@chess/ui'
import { GameRows } from '#/components/play'
import { listGames } from '#/lib/data/play'

const PAGE = 30

export const Route = createFileRoute('/games/')({
  loader: ({ context: { app } }) => listGames(app.db, PAGE),
  component: Games,
})

/** Every game against the computer, newest first, a page at a time. */
function Games() {
  const { app } = Route.useRouteContext()
  const first = Route.useLoaderData()
  const [items, setItems] = useState(first.items)
  const [next, setNext] = useState(first.next)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function more() {
    if (!next) return
    setBusy(true)
    try {
      const page = await listGames(app.db, PAGE, next)
      setItems((now) => [...now, ...page.items])
      setNext(page.next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The next page could not be read.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading size="xl">Games</SectionHeading>
      <GameRows games={items} />
      <LoadMore pager={{ hasMore: next !== null, busy, error, more }} />
    </section>
  )
}
