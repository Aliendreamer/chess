import { parseBroadcasts, parseFeed, shownEvents } from '@chess/core'
import { getSetting, setSetting } from './settings'
import type { BroadcastEvent } from '@chess/core'
import type { ChessEvent, NewsItem, NewsSource } from '@chess/ui'
import type { Db } from './db'

/**
 * Chess news (chess-news, desktop-app D7): the club's feeds and lichess's list of tournaments being played, fetched by
 * the app while it runs and the machine is online, kept here so a headline or a tournament you missed is still there
 * later. Headlines, links and dates only; every link opens in the system browser.
 */

export interface FeedSource extends NewsSource {
  url: string
  /** TWIC answers its feed only to a feed reader's Accept header. */
  accept?: string
}

export const FEEDS: ReadonlyArray<FeedSource> = [
  { id: 'fide', name: 'FIDE', url: 'https://www.fide.com/feed/' },
  { id: 'chessbase', name: 'ChessBase', url: 'https://en.chessbase.com/feed' },
  { id: 'lichess', name: 'Lichess', url: 'https://lichess.org/@/Lichess/blog.atom' },
  {
    id: 'twic',
    name: 'The Week in Chess',
    url: 'https://theweekinchess.com/twic-rss-feed',
    accept: 'application/rss+xml',
  },
]

export const BROADCAST_URL = 'https://lichess.org/api/broadcast/top?page=1'
export const NEWS_EVERY_MS = 60 * 60_000
export const EVENTS_EVERY_MS = 10 * 60_000
export const KEEP_DAYS = 90
const MAX_BYTES = 2_000_000

/** A GET as the shell does it (tauri-plugin-http, no browser CORS): the status and the text. */
export type FetchText = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ status: number; text: string }>

/** The sources the person keeps on (all by default). */
export async function enabledSources(db: Db): Promise<Array<string>> {
  return getSetting(db, 'news.sources', [...FEEDS.map((f) => f.id), 'events'])
}

export async function setSourceEnabled(db: Db, id: string, on: boolean): Promise<void> {
  const now = new Set(await enabledSources(db))
  if (on) now.add(id)
  else now.delete(id)
  await setSetting(db, 'news.sources', [...now])
}

/** One round over the feeds: each fetched on its own, so one failing leaves the others and its own stored items. */
export async function newsRound(
  db: Db,
  fetchText: FetchText,
  now = new Date(),
): Promise<{ fetched: Array<string>; failed: Array<string> }> {
  const on = new Set(await enabledSources(db))
  const fetched: Array<string> = []
  const failed: Array<string> = []
  for (const feed of FEEDS.filter((f) => on.has(f.id))) {
    try {
      const answer = await fetchText(feed.url, feed.accept ? { Accept: feed.accept } : {})
      if (answer.status !== 200 || answer.text.length > MAX_BYTES)
        throw new Error(`HTTP ${answer.status}`)
      const items = parseFeed(answer.text, now)
      await db.batch(
        items.map((i) => ({
          sql: `INSERT INTO news_items (url, source, title, published_at, fetched_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (url) DO UPDATE SET title = excluded.title`,
          params: [i.url, feed.id, i.title, i.publishedAt.toISOString(), now.toISOString()],
        })),
      )
      fetched.push(feed.id)
    } catch {
      failed.push(feed.id)
    }
  }
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()
  await db.execute('DELETE FROM news_items WHERE published_at < ?', [cutoff])
  return { fetched, failed }
}

/** One round over the tournament list: replaced whole when it answers; `paused` after a 429 (rate limited). */
export async function eventsRound(
  db: Db,
  fetchText: FetchText,
  now = new Date(),
): Promise<'ok' | 'paused' | 'failed' | 'off'> {
  if (!(await enabledSources(db)).includes('events')) return 'off'
  let events: Array<BroadcastEvent>
  try {
    const answer = await fetchText(BROADCAST_URL, { Accept: 'application/json' })
    if (answer.status === 429) return 'paused'
    if (answer.status !== 200 || answer.text.length > MAX_BYTES) return 'failed'
    events = parseBroadcasts(answer.text, now)
  } catch {
    return 'failed'
  }
  await db.batch([
    { sql: 'DELETE FROM chess_events' },
    ...events.map((e) => ({
      sql: `INSERT INTO chess_events (id, name, url, round_name, round_url, ongoing, location, fide_tc, tier, starts_at, ends_at, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        e.id,
        e.name,
        e.url,
        e.roundName,
        e.roundUrl,
        e.ongoing ? 1 : 0,
        e.location,
        e.fideTc,
        e.tier,
        e.startsAt?.toISOString() ?? null,
        e.endsAt?.toISOString() ?? null,
        now.toISOString(),
      ],
    })),
  ])
  return 'ok'
}

/** The headlines kept, newest first: every source, or one. */
export async function latestNews(db: Db, limit: number, source?: string): Promise<Array<NewsItem>> {
  const rows = await db.select<{
    url: string
    source: string
    title: string
    published_at: string
  }>(
    source
      ? 'SELECT url, source, title, published_at FROM news_items WHERE source = ? ORDER BY published_at DESC LIMIT ?'
      : 'SELECT url, source, title, published_at FROM news_items ORDER BY published_at DESC LIMIT ?',
    source ? [source, limit] : [limit],
  )
  const names = new Map(FEEDS.map((f) => [f.id, f.name]))
  return rows.map((r) => ({
    id: r.url,
    source: r.source,
    sourceName: names.get(r.source) ?? r.source,
    title: r.title,
    url: r.url,
    publishedAt: r.published_at,
  }))
}

/** The tournaments kept from the last answer: rounds being played first, then the most important, then the earliest. */
export async function currentEvents(db: Db, count: number): Promise<Array<ChessEvent>> {
  const rows = await db.select<{
    id: string
    name: string
    url: string
    round_name: string | null
    round_url: string | null
    ongoing: number
    location: string | null
    fide_tc: string | null
    tier: number
    starts_at: string | null
    ends_at: string | null
    fetched_at: string
  }>('SELECT * FROM chess_events')
  const events: Array<BroadcastEvent> = rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    roundName: r.round_name,
    roundUrl: r.round_url,
    ongoing: r.ongoing === 1,
    location: r.location,
    fideTc: r.fide_tc,
    tier: r.tier,
    startsAt: r.starts_at ? new Date(r.starts_at) : null,
    endsAt: r.ends_at ? new Date(r.ends_at) : null,
    fetchedAt: new Date(r.fetched_at),
  }))
  return shownEvents(events, count).map((e) => ({
    id: e.id,
    name: e.name,
    url: e.url,
    roundName: e.roundName,
    roundUrl: e.roundUrl,
    ongoing: e.ongoing,
    location: e.location,
    fideTc: e.fideTc,
    startsAt: e.startsAt?.toISOString() ?? null,
    endsAt: e.endsAt?.toISOString() ?? null,
  }))
}
