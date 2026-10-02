import { readJson } from './upstream'
import type { CursorPage } from '../play'
import type { ChessEvent, NewsItem, NewsSource } from '../news'

/** `GET /api/news`: headlines newest first, one source's or all. */
export async function loadNews(
  fetchImpl: typeof fetch,
  page: { limit: number; source?: string | undefined; cursor?: string | undefined },
): Promise<CursorPage<NewsItem>> {
  const query = new URLSearchParams({ limit: String(page.limit) })
  if (page.source) query.set('source', page.source)
  if (page.cursor) query.set('cursor', page.cursor)
  return readJson<CursorPage<NewsItem>>(
    await fetchImpl(`/api/news?${query.toString()}`),
    'GET /api/news',
  )
}

/** `GET /api/news/sources`: the enabled sources, for the filter. */
export async function loadNewsSources(fetchImpl: typeof fetch): Promise<Array<NewsSource>> {
  return readJson<Array<NewsSource>>(await fetchImpl('/api/news/sources'), 'GET /api/news/sources')
}

/** `GET /api/news/events`: the tournaments being played now (empty when lichess has not answered for an hour). */
export async function loadEvents(fetchImpl: typeof fetch): Promise<Array<ChessEvent>> {
  return readJson<Array<ChessEvent>>(await fetchImpl('/api/news/events'), 'GET /api/news/events')
}
