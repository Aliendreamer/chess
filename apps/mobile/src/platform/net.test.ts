import { fetchText } from './net'

afterEach(() => jest.restoreAllMocks())

test('a GET with the given headers, answered with its status and text', async () => {
  const fetch = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response('<rss/>', { status: 200 }))
  expect(await fetchText('https://www.fide.com/rss', { Accept: 'application/rss+xml' })).toEqual({
    status: 200,
    text: '<rss/>',
  })
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('https://www.fide.com/rss')
  expect(init?.method).toBe('GET')
  expect(init?.headers).toEqual({ Accept: 'application/rss+xml' })
  expect(init?.signal).toBeDefined()
})

test('refuses anything but https, as the feed parsers do', async () => {
  await expect(fetchText('http://example.org/feed', {})).rejects.toThrow('https')
})
