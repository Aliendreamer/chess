import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { loadPlayer, loadPlayerGames } from './players'

function fakeFetch(status: number, body: unknown, urls: Array<string> = []): typeof fetch {
  return (input) => {
    urls.push(String(input))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

describe('loadPlayer', () => {
  it('reads a profile, and an unknown player is null', async () => {
    const urls: Array<string> = []
    const profile = { id: 7, name: 'player' }
    expect(await loadPlayer(fakeFetch(200, profile, urls), 7)).toEqual(profile)
    expect(urls).toEqual(['/api/players/7'])
    expect(await loadPlayer(fakeFetch(404, {}), 8)).toBeNull()
  })

  it('sends a lost session to login', async () => {
    await expect(loadPlayer(fakeFetch(401, {}), 7)).rejects.toSatisfy(isRedirect)
  })
})

describe('loadPlayerGames', () => {
  it('pages through a player’s games', async () => {
    const urls: Array<string> = []
    await loadPlayerGames(fakeFetch(200, { items: [], nextCursor: null, limit: 20 }, urls), -1, {
      limit: 20,
      cursor: 'c',
    })
    expect(urls).toEqual(['/api/players/-1/games?limit=20&cursor=c'])
  })
})
