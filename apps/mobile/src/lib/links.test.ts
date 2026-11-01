import { appHref, mobileRoute } from './links'

describe('mobileRoute', () => {
  test.each([
    ['/', '/play'],
    ['/games', '/play/games'],
    ['/games/g%201', '/play/games/g%201'],
    ['/analysis?library=7&ply=12', '/analyse?library=7&ply=12'],
    ['/library', '/analyse/library'],
    ['/studies', '/learn/studies'],
    ['/studies/s1', '/learn/studies/s1'],
    ['/trainer?color=white', '/learn/trainer?color=white'],
    ['/trainer/Italian%20Game?color=black', '/learn/trainer/Italian%20Game?color=black'],
    ['/trainer/study/s1', '/learn/trainer/study/s1'],
    ['/training', '/learn/training'],
    ['/news?source=fide', '/news?source=fide'],
    ['/settings', '/more/settings'],
    ['/about', '/more/about'],
  ])('%s → %s', (desktop, mobile) => {
    expect(mobileRoute(desktop)).toBe(mobile)
  })

  test('refuses a path the app has no screen for, instead of opening the wrong one', () => {
    expect(() => mobileRoute('/admin')).toThrow('/admin')
  })
})

test('appHref builds the query as the desktop does, leaving out empty values', () => {
  expect(appHref('/trainer', { color: 'white', source: undefined, n: null })).toBe(
    '/trainer?color=white',
  )
  expect(appHref('/analysis', { library: 'a b', ply: 3 })).toBe('/analysis?library=a%20b&ply=3')
  expect(appHref('/training', {})).toBe('/training')
})
