import { describe, expect, it } from 'vitest'
import { downloadPgn } from './pgn-download'

const ID = '0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f'
const env = { API_URL: 'http://backend:8080' } as NodeJS.ProcessEnv
const PGN = '[Event "Casual game"]\n[White "ann"]\n\n1. e4 e5 0-1\n'

function request(cookie?: string): Request {
  return new Request(`http://app.chess.localhost/pgn/${ID}`, cookie ? { headers: { cookie } } : {})
}

describe('downloadPgn', () => {
  it('fetches the PGN server-side with the session and hands it over as a file', async () => {
    const seen: Array<{ url: string; cookie: string | null }> = []
    const fetchImpl: typeof fetch = (input, init) => {
      seen.push({ url: String(input), cookie: new Headers(init?.headers).get('cookie') })
      return Promise.resolve(new Response(PGN, { status: 200 }))
    }

    const res = await downloadPgn(request('mp_sid=abc; other=x'), ID, fetchImpl, env)

    expect(seen).toEqual([{ url: `http://backend:8080/api/games/${ID}/pgn`, cookie: 'mp_sid=abc' }])
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/x-chess-pgn; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="chess-0199f1c2a3b47c5d8e9f0a1b2c3d4e5f.pgn"',
    )
    expect(await res.text()).toBe(PGN)
  })

  it('sends an anonymous visitor to login', async () => {
    const res = await downloadPgn(
      request(),
      ID,
      () => Promise.resolve(new Response('', { status: 401 })),
      env,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `/api/auth/login?returnTo=${encodeURIComponent(`/games/${ID}`)}`,
    )
  })

  it('passes a missing or unfinished game on as its status', async () => {
    const res = await downloadPgn(
      request('mp_sid=abc'),
      ID,
      () => Promise.resolve(new Response('', { status: 404 })),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('refuses something that is not a game id without calling the API', async () => {
    let called = false
    const res = await downloadPgn(
      request('mp_sid=abc'),
      '../admin',
      () => {
        called = true
        return Promise.resolve(new Response(''))
      },
      env,
    )
    expect(called).toBe(false)
    expect(res.status).toBe(400)
  })
})
