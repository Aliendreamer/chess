import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { MyGameItem } from '#/lib/play'
import { getMyGames } from '#/lib/server/api'
import { Button } from '#/components/core/Button'
import { SectionHeading } from '#/components/core/Panel'
import { RecentGames } from '#/components/play/RecentGames'

const PAGE = 20

/** Your games, newest first, keyset-paged from the replica ("Load more" follows the cursor). */
export const Route = createFileRoute('/_authenticated/games/')({
  loader: () => getMyGames({ data: { limit: PAGE } }),
  component: HistoryPage,
})

function HistoryPage() {
  const first = Route.useLoaderData()
  const [games, setGames] = useState<Array<MyGameItem>>(first.items)
  const [cursor, setCursor] = useState(first.nextCursor)
  const [loading, setLoading] = useState(false)

  async function more() {
    if (!cursor) return
    setLoading(true)
    try {
      const page = await getMyGames({ data: { limit: PAGE, cursor } })
      setGames((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">History</SectionHeading>
      <RecentGames games={games} pgn />
      {cursor ? (
        <div>
          <Button disabled={loading} onClick={() => void more()}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
