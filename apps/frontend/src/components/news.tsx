import { Link } from '@tanstack/react-router'
import { Panel } from '@chess/ui'
import type { ChessEvent, NewsItem, NewsSource } from '#/lib/news'
import { ageText, hostOf, timeControlLabel } from '#/lib/news'

/**
 * Chess news and the tournaments being played (chess-news): headlines that open the article on its own site, and
 * events that open on lichess. Nothing of the articles or the games is shown here.
 */

export function NewsList({ items, nowMs }: { items: ReadonlyArray<NewsItem>; nowMs: number }) {
  if (items.length === 0) return <p className="m-0 text-sm text-fg-secondary">No news yet.</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="news">
      {items.map((n) => (
        <li key={n.id} className="flex flex-col gap-0.5 border-b border-line-divider py-2.5">
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${n.title} (opens ${hostOf(n.url)})`}
            className="text-fg-primary no-underline hover:text-fg-accent hover:underline"
          >
            {n.title}
          </a>
          <span className="text-xs text-fg-secondary">{`${n.sourceName} · ${ageText(n.publishedAt, nowMs)}`}</span>
        </li>
      ))}
    </ul>
  )
}

/** One headline as a compact card: two lines of title at most, then source and age. */
function NewsCard({
  item,
  nowMs,
  showSource,
}: {
  item: NewsItem
  nowMs: number
  /** One source's grid: a boxed card naming the source; a source column: a slim row under a divider. */
  showSource: boolean
}) {
  return (
    <li
      className={
        showSource
          ? 'flex flex-col gap-1 rounded-card border border-line-default bg-surface-raised px-3 py-2.5 hover:border-line-accent'
          : 'flex flex-col gap-0.5 border-b border-line-divider py-1.5'
      }
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${item.title} (opens ${hostOf(item.url)})`}
        className="line-clamp-2 text-sm text-fg-primary no-underline hover:text-fg-accent hover:underline"
      >
        {item.title}
      </a>
      <span className="text-xs text-fg-secondary">
        {showSource
          ? `${item.sourceName} · ${ageText(item.publishedAt, nowMs)}`
          : ageText(item.publishedAt, nowMs)}
      </span>
    </li>
  )
}

/**
 * `/news` with every source: a column per source, side by side across the page, each scrolling on its own so the
 * page itself fits the screen (as the command center's feeds do).
 */
export function NewsColumns({
  columns,
  nowMs,
}: {
  columns: ReadonlyArray<{ source: NewsSource; items: ReadonlyArray<NewsItem> }>
  nowMs: number
}) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4 shell:min-h-0 shell:flex-1"
      data-testid="news-columns"
    >
      {columns.map(({ source, items }) => (
        <section
          key={source.id}
          className="flex min-h-0 min-w-0 flex-col gap-2"
          aria-label={source.name}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="m-0 font-display text-lg font-normal">{source.name}</h2>
            <Link to="/news" search={{ source: source.id }} className="text-xs text-fg-accent">
              More
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="m-0 text-sm text-fg-secondary">No news yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {items.map((n) => (
                <NewsCard key={n.id} item={n} nowMs={nowMs} showSource={false} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

/** One source's headlines on `/news?source=`: cards across the page's width. */
export function NewsGrid({ items, nowMs }: { items: ReadonlyArray<NewsItem>; nowMs: number }) {
  if (items.length === 0) return <p className="m-0 text-sm text-fg-secondary">No news yet.</p>
  return (
    <ul
      className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-2 p-0"
      data-testid="news"
    >
      {items.map((n) => (
        <NewsCard key={n.id} item={n} nowMs={nowMs} showSource />
      ))}
    </ul>
  )
}

/** "Events now" on home: tournaments being played, live rounds marked, each opening on lichess. */
export function EventsNow({ events }: { events: ReadonlyArray<ChessEvent> }) {
  if (events.length === 0) return null
  return (
    <Panel variant="outlined" title="Events now" className="gap-2" testId="events-now">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {events.map((e) => {
          const href = e.roundUrl ?? e.url
          return (
            <li key={e.id} className="flex flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                {e.ongoing ? (
                  <span className="rounded-full bg-status-loss px-1.5 text-2xs font-semibold uppercase text-surface-page">
                    live
                  </span>
                ) : null}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${e.name} (opens ${hostOf(href)})`}
                  className="truncate text-sm text-fg-primary no-underline hover:text-fg-accent hover:underline"
                >
                  {e.name}
                </a>
              </span>
              <span className="text-xs text-fg-secondary">
                {[e.location, timeControlLabel(e.fideTc), e.roundName].filter(Boolean).join(' · ')}
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
