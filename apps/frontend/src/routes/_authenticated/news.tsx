import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useLoadMore } from '#/lib/play'
import { getNews, getNewsSources } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import { NewsList } from '#/components/news'
import { Chip, LoadMore, Panel, SectionHeading } from '#/components/ui'

const PAGE = 30

/** Chess news (chess-news): headlines from the sources the club follows, each opening the article on its own site. */
export const Route = createFileRoute('/_authenticated/news')({
  validateSearch: (search: Record<string, unknown>): { source?: string } =>
    typeof search['source'] === 'string' && /^[a-z0-9-]{1,32}$/.test(search['source'])
      ? { source: search['source'] }
      : {},
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, sources] = await Promise.all([
      getNews({ data: { limit: PAGE, ...(deps.source ? { source: deps.source } : {}) } }),
      getNewsSources(),
    ])
    return { page, sources }
  },
  head: () => ({ meta: [{ title: pageTitle('News') }] }),
  component: NewsPage,
})

function NewsPage() {
  const { page, sources } = Route.useLoaderData()
  const { source } = Route.useSearch()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">News</SectionHeading>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Source">
        <Chip selected={!source} onClick={() => void navigate({ to: '/news', search: {} })}>
          All
        </Chip>
        {sources.map((s) => (
          <Chip
            key={s.id}
            selected={source === s.id}
            onClick={() => void navigate({ to: '/news', search: { source: s.id } })}
          >
            {s.name}
          </Chip>
        ))}
      </div>
      <Headlines key={source ?? 'all'} first={page} source={source} />
      <Panel variant="quiet" title="About the news" className="text-sm text-fg-secondary">
        <p className="m-0">
          Headlines and links only, fetched every half hour from the sources' public feeds; every
          article opens on its own site. Tournaments now come from lichess's broadcasts.
        </p>
      </Panel>
    </div>
  )
}

function Headlines({
  first,
  source,
}: {
  first: ReturnType<typeof Route.useLoaderData>['page']
  source: string | undefined
}) {
  const pager = useLoadMore(first, (cursor) =>
    getNews({ data: { limit: PAGE, cursor, ...(source ? { source } : {}) } }),
  )
  return (
    <section className="flex flex-col gap-3" aria-label="Headlines">
      <NewsList items={pager.items} nowMs={Date.now()} />
      <LoadMore pager={pager} />
    </section>
  )
}
