import { afterEach, describe, expect, it } from 'vitest'
import { openDb } from './db'
import { currentEvents, eventsRound, latestNews, newsRound, setSourceEnabled } from './news'
import type { FetchText } from './news'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const rss = (title: string, url: string, date: string) =>
  `<rss version="2.0"><channel><item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`
const NOW = new Date('2026-10-16T12:00:00Z')

/** Answers by URL; anything not listed fails as a network error would. */
function web(
  answers: Record<string, { status: number; text: string }>,
): FetchText & { asked: Array<{ url: string; headers: Record<string, string> }> } {
  const asked: Array<{ url: string; headers: Record<string, string> }> = []
  const fetchText = (url: string, headers: Record<string, string>) => {
    asked.push({ url, headers })
    const answer = answers[url]
    return answer ? Promise.resolve(answer) : Promise.reject(new Error('offline'))
  }
  return Object.assign(fetchText, { asked })
}

describe('news (chess-news, desktop-app D7)', () => {
  it('keeps each source’s headlines, and a failing source leaves its stored items', async () => {
    const db = await testDb()
    const first = web({
      'https://www.fide.com/feed/': {
        status: 200,
        text: rss('FIDE news', 'https://www.fide.com/a', 'Fri, 16 Oct 2026 10:00:00 +0000'),
      },
      'https://en.chessbase.com/feed': {
        status: 200,
        text: rss(
          'ChessBase news',
          'https://en.chessbase.com/b',
          'Fri, 16 Oct 2026 09:00:00 +0000',
        ),
      },
    })
    expect(await newsRound(db, first, NOW)).toEqual({
      fetched: ['fide', 'chessbase'],
      failed: ['lichess', 'twic'],
    })
    const second = web({
      'https://www.fide.com/feed/': {
        status: 200,
        text: rss('FIDE later', 'https://www.fide.com/c', 'Fri, 16 Oct 2026 11:00:00 +0000'),
      },
      'https://en.chessbase.com/feed': { status: 503, text: '' },
    })
    expect((await newsRound(db, second, NOW)).failed).toContain('chessbase')
    expect((await latestNews(db, 10)).map((n) => n.title)).toEqual([
      'FIDE later',
      'FIDE news',
      'ChessBase news',
    ])
    expect((await latestNews(db, 10, 'chessbase'))[0]?.sourceName).toBe('ChessBase')
    expect(first.asked.find((a) => a.url.includes('theweekinchess'))?.headers).toEqual({
      Accept: 'application/rss+xml',
    })
  })

  it('forgets headlines older than the keep period, and skips a source turned off', async () => {
    const db = await testDb()
    await setSourceEnabled(db, 'chessbase', false)
    const fetchText = web({
      'https://www.fide.com/feed/': {
        status: 200,
        text: rss('Old', 'https://www.fide.com/old', 'Mon, 01 Jun 2026 10:00:00 +0000'),
      },
    })
    await newsRound(db, fetchText, NOW)
    expect(await latestNews(db, 10)).toEqual([])
    expect(fetchText.asked.some((a) => a.url.includes('chessbase'))).toBe(false)
  })

  it('replaces the tournaments whole, and pauses after a 429', async () => {
    const db = await testDb()
    const list = JSON.stringify({
      active: [
        { tour: { id: 'a1', name: 'Calm', url: 'https://lichess.org/broadcast/calm/a1', tier: 5 } },
        {
          tour: { id: 'b2', name: 'Live', url: 'https://lichess.org/broadcast/live/b2', tier: 3 },
          round: { ongoing: true },
        },
      ],
    })
    expect(
      await eventsRound(
        db,
        web({ 'https://lichess.org/api/broadcast/top?page=1': { status: 200, text: list } }),
        NOW,
      ),
    ).toBe('ok')
    expect((await currentEvents(db, 5)).map((e) => e.name)).toEqual(['Live', 'Calm'])
    expect(
      await eventsRound(
        db,
        web({ 'https://lichess.org/api/broadcast/top?page=1': { status: 429, text: '' } }),
        NOW,
      ),
    ).toBe('paused')
    expect(await currentEvents(db, 5)).toHaveLength(2)
    expect(await eventsRound(db, web({}), NOW)).toBe('failed')
  })
})
