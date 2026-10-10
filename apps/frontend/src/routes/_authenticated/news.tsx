import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useLoadMore } from '#/lib/play'
import { getNews, getNewsSources } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import { NewsColumns, NewsGrid } from '#/components/news'
import { Chip, LoadMore, SectionHeading } from '#/components/ui'

const PAGE = 20
/** Headlines per source column when every source is shown. */
const PER_SOURCE = 10

/** Chess news (chess-news): headlines from the sources the club follows, each opening the article on its own site. */
export const Route = createFileRoute('/_authenticated/news')({
  validateSearch: (search: Record<string, unknown>): { source?: string } =>
    typeof search['source'] === 'string' && /^[a-z0-9-]{1,32}$/.test(search['source'])
      ? { source: search['source'] }
      : {},
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const sources = await getNewsSources()
    if (deps.source) {
      const page = await getNews({ data: { limit: PAGE, source: deps.source } })
      return { sources, page, columns: [] }
    }
    // Every source: its newest headlines in a column of its own.
    const columns = await Promise.all(
      sources.map(async (source) => ({
        source,
        items: (await getNews({ data: { limit: PER_SOURCE, source: source.id } })).items,
      })),
    )
    return { sources, page: null, columns }
  },
  head: () => ({ meta: [{ title: pageTitle('News') }] }),
  component: NewsPage,
})

function NewsPage() {
  const { page, sources, columns } = Route.useLoaderData()
  const { source } = Route.useSearch()
  const navigate = useNavigate()
  return (
    <div className="flex min-w-0 flex-col gap-4 shell:h-full" data-layout="wide fill">
      <div className="flex flex-col gap-1">
        <SectionHeading size="xl">News</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          Headlines and links only, fetched every half hour from the sources' public feeds; every
          article opens on its own site.
        </p>
      </div>
      <div className="flex max-w-full flex-wrap gap-2" role="group" aria-label="Source">
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
      {source && page ? (
        <Headlines key={source} first={page} source={source} />
      ) : (
        <NewsColumns columns={columns} nowMs={Date.now()} />
      )}
    </div>
  )
}

function Headlines({
  first,
  source,
}: {
  first: NonNullable<ReturnType<typeof Route.useLoaderData>['page']>
  source: string
}) {
  const pager = useLoadMore(first, (cursor) => getNews({ data: { limit: PAGE, cursor, source } }))
  return (
    <section
      className="flex flex-col gap-3 shell:min-h-0 shell:flex-1 shell:overflow-y-auto shell:pr-1"
      aria-label="Headlines"
    >
      <NewsGrid items={pager.items} nowMs={Date.now()} />
      <LoadMore pager={pager} />
    </section>
  )
}
