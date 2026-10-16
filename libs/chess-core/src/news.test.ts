import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_TITLE, parseBroadcasts, parseFeed, shownEvents } from './news.ts'
import type { ChessEvent } from './news.ts'

// The backend's FeedParserTests and BroadcastParserTests, case for case, on the same saved samples.

const FETCHED = new Date('2026-10-02T15:00:00Z')
const sample = (file: string) =>
  readFileSync(
    new URL(`../../../apps/backend/Chess.Backend.Tests/News/Samples/${file}`, import.meta.url),
    'utf8',
  )

describe('feeds (FeedParserTests)', () => {
  it.each([
    [
      'fide.xml',
      'Small Nations Chess Association restarts activities and elects new Board',
      'https://www.fide.com/small-nations-chess-association-restarts-activities-and-elects-new-board/',
      '2026-10-02T13:26:42Z',
    ],
    [
      'chessbase.xml',
      'Jon Speelman at 70: A leading figure of English chess',
      'https://en.chessbase.com/post/jon-speelman-70th-birthday',
      '2026-10-02T14:00:00Z',
    ],
    [
      'twic.xml',
      '46th World Chess Olympiad 2026 - Games and Results',
      'https://theweekinchess.com/chessnews/events/46th-world-chess-olympiad-2026',
      '2026-09-17T20:10:00Z',
    ],
    [
      'ecf.xml',
      'Coaching blind players',
      'https://www.englishchess.org.uk/coaching-blind-players/',
      '2026-09-30T08:21:32Z',
    ],
    [
      'lichess.xml',
      'Streamer Arenas Announcement — August to December 2026',
      'https://lichess.org/@/Lichess/blog/streamer-arenas-announcement-august-to-december-2026/tkby72bI',
      '2026-08-16T19:40:30.817Z',
    ],
  ])('%s gives its headlines, links and dates', (file, title, url, published) => {
    const items = parseFeed(sample(file), FETCHED)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({ title, url, publishedAt: new Date(published) })
  })

  it('rejects the whole feed for an entity declaration', () => {
    const hostile = `<?xml version="1.0"?>
<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<rss version="2.0"><channel><item><title>&xxe;</title><link>https://example.org/a</link></item></channel></rss>`
    expect(() => parseFeed(hostile, FETCHED)).toThrow()
    const undeclared =
      '<rss><channel><item><title>&xxe;</title><link>https://example.org/a</link></item></channel></rss>'
    expect(() => parseFeed(undeclared, FETCHED)).toThrow()
  })

  it('keeps titles as plain text and only https links', () => {
    const feed = `<rss version="2.0"><channel>
  <item><title><![CDATA[<b>Gukesh</b> wins &amp; leads]]></title><link>https://example.org/a</link></item>
  <item><title>Script</title><link>javascript:alert(1)</link></item>
  <item><title>Plain http</title><link>http://example.org/b</link></item>
  <item><title>   </title><link>https://example.org/c</link></item>
</channel></rss>`
    expect(parseFeed(feed, FETCHED)).toEqual([
      { title: 'Gukesh wins & leads', url: 'https://example.org/a', publishedAt: FETCHED },
    ])
  })

  it('cuts a long title', () => {
    const feed = `<rss version="2.0"><channel><item><title>${'x'.repeat(500)}</title><link>https://example.org/a</link></item></channel></rss>`
    expect(parseFeed(feed, FETCHED)[0]?.title).toHaveLength(MAX_TITLE)
  })

  it('finds no items in something that is not a feed, and refuses what is not XML', () => {
    expect(parseFeed('<html><body>blocked</body></html>', FETCHED)).toEqual([])
    expect(() => parseFeed('blocked', FETCHED)).toThrow()
    expect(() => parseFeed('<rss><channel></rss>', FETCHED)).toThrow()
  })

  it('reads an Atom entry’s alternate link and its updated date', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">A &lt;i&gt;b&lt;/i&gt; c</title>
<link rel="self" href="https://example.org/self"/><link href="https://example.org/post"/><updated>2026-10-01T10:00:00</updated></entry></feed>`
    expect(parseFeed(atom, FETCHED)).toEqual([
      {
        title: 'A b c',
        url: 'https://example.org/post',
        publishedAt: new Date('2026-10-01T10:00:00Z'),
      },
    ])
  })
})

describe('tournaments (BroadcastParserTests)', () => {
  it('keeps the active tournaments’ names, place, time control, round and links', () => {
    const events = parseBroadcasts(sample('broadcasts.json'), FETCHED)
    expect(events).toHaveLength(4)
    const first = events[0]!
    expect([first.id, first.fideTc, first.tier, first.roundName, first.ongoing]).toEqual([
      '2aIImqz1',
      'rapid',
      4,
      'Round 1',
      false,
    ])
    expect(first.name.startsWith('2026 Army and Navy Club Pall Mall Masters')).toBe(true)
    expect(first.url.startsWith('https://lichess.org/broadcast/')).toBe(true)
    expect(first.roundUrl?.startsWith('https://lichess.org/broadcast/')).toBe(true)
    expect(first.startsAt).toEqual(new Date(1791018000000))
    expect(first.fetchedAt).toBe(FETCHED)
  })

  it('keeps only lichess links, and never images', () => {
    const json = `{ "active": [
  { "tour": { "id": "a1", "name": "Elsewhere", "url": "https://evil.example/x", "tier": 5, "image": "https://image.lichess1.org/x" } },
  { "tour": { "id": "b2", "name": "Good", "url": "https://lichess.org/broadcast/good/b2", "tier": 3 },
    "round": { "name": "Round 2", "url": "javascript:alert(1)", "ongoing": true } }
] }`
    const events = parseBroadcasts(json, FETCHED)
    expect(events.map((e) => [e.id, e.roundUrl, e.ongoing])).toEqual([['b2', null, true]])
    expect(JSON.stringify(events)).not.toContain('image')
  })

  it('finds no events without JSON or an active list', () => {
    expect(() => parseBroadcasts('<html>blocked</html>', FETCHED)).toThrow()
    expect(parseBroadcasts('{ "upcoming": [] }', FETCHED)).toEqual([])
  })

  it('shows live rounds first, then the most important, then the earliest', () => {
    const event = (id: string, ongoing: boolean, tier: number, startDay: number): ChessEvent => ({
      id,
      name: id,
      url: `https://lichess.org/broadcast/${id}`,
      roundName: null,
      roundUrl: null,
      ongoing,
      location: null,
      fideTc: null,
      tier,
      startsAt: new Date(Date.UTC(2026, 9, 1 + startDay)),
      endsAt: null,
      fetchedAt: FETCHED,
    })
    const events = [
      event('calm-top', false, 5, 0),
      event('live-low', true, 2, 3),
      event('calm-low-early', false, 2, 0),
      event('live-top', true, 5, 1),
      event('calm-low-late', false, 2, 2),
    ]
    expect(shownEvents(events, 4).map((e) => e.id)).toEqual([
      'live-top',
      'live-low',
      'calm-top',
      'calm-low-early',
    ])
  })
})
