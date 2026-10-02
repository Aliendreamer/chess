import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { loadEvents, loadNews, loadNewsSources } from './news'

function fakeFetch(status: number, body: unknown, urls: Array<string> = []): typeof fetch {
  return (input) => {
    urls.push(String(input))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

describe('news reads', () => {
  it('pages the headlines, one source or all', async () => {
    const urls: Array<string> = []
    const page = { items: [], nextCursor: null, limit: 8 }
    await loadNews(fakeFetch(200, page, urls), { limit: 8 })
    await loadNews(fakeFetch(200, page, urls), { limit: 20, source: 'fide', cursor: 'c' })
    expect(urls).toEqual(['/api/news?limit=8', '/api/news?limit=20&source=fide&cursor=c'])
  })

  it('reads the sources and the events', async () => {
    const urls: Array<string> = []
    await loadNewsSources(fakeFetch(200, [], urls))
    await loadEvents(fakeFetch(200, [], urls))
    expect(urls).toEqual(['/api/news/sources', '/api/news/events'])
  })

  it('sends a lost session to login', async () => {
    await expect(loadNews(fakeFetch(401, {}), { limit: 8 })).rejects.toSatisfy(isRedirect)
  })
})
