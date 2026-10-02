import type { ChessEvent, NewsItem } from '#/lib/news'
import { ageText, hostOf, timeControlLabel } from '#/lib/news'
import { Panel } from '#/components/ui'

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
