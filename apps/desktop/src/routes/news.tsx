import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Chip, NewsColumns, NewsGrid, SectionHeading } from '@chess/ui'
import { FEEDS, latestNews } from '#/lib/data/news'

const PER_SOURCE = 15

/** Chess news (chess-news): the headlines kept from the club's sources, each opening the article in the browser. */
export const Route = createFileRoute('/news')({
  validateSearch: (search: Record<string, unknown>): { source?: string } =>
    typeof search['source'] === 'string' && FEEDS.some((f) => f.id === search['source'])
      ? { source: search['source'] }
      : {},
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { app }, deps }) => {
    if (deps.source) return { items: await latestNews(app.db, 100, deps.source), columns: [] }
    const columns = await Promise.all(
      FEEDS.map(async (source) => ({
        source,
        items: await latestNews(app.db, PER_SOURCE, source.id),
      })),
    )
    return { items: null, columns }
  },
  component: NewsPage,
})

function NewsPage() {
  const { items, columns } = Route.useLoaderData()
  const { source } = Route.useSearch()
  const navigate = useNavigate()
  const empty = items ? items.length === 0 : columns.every((c) => c.items.length === 0)
  return (
    <div className="flex min-w-0 flex-col gap-4" data-layout="wide">
      <div className="flex flex-col gap-1">
        <SectionHeading size="xl">News</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          Headlines and links only, fetched every hour while the app is open and kept for 90 days;
          every article opens in your browser.
        </p>
      </div>
      <div className="flex max-w-full flex-wrap gap-2" role="group" aria-label="Source">
        <Chip selected={!source} onClick={() => void navigate({ to: '/news', search: {} })}>
          All
        </Chip>
        {FEEDS.map((s) => (
          <Chip
            key={s.id}
            selected={source === s.id}
            onClick={() => void navigate({ to: '/news', search: { source: s.id } })}
          >
            {s.name}
          </Chip>
        ))}
      </div>
      {empty ? (
        <p className="text-sm text-fg-muted" data-testid="news-empty">
          Nothing yet: the news is fetched once the computer is online.
        </p>
      ) : items ? (
        <NewsGrid items={items} nowMs={Date.now()} />
      ) : (
        <NewsColumns columns={columns} nowMs={Date.now()} />
      )}
    </div>
  )
}
