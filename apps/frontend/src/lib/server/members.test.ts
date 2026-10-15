import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { answerChallenge, loadMembers, sendChallenge } from './members'

const INVITE = '7c9e6679742540de944be07fc1f90ae7'

type Call = { url: string; method: string; body: string | null }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: (init?.body as string | undefined) ?? null,
    })
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

describe('loadMembers', () => {
  it('reads the members list', async () => {
    const calls: Array<Call> = []
    const view = { items: [], presenceKnown: true }
    expect(await loadMembers(fakeFetch(200, view, calls))).toEqual(view)
    expect(calls[0]?.url).toBe('/api/members')
  })

  it('sends a lost session to login', async () => {
    await expect(loadMembers(fakeFetch(401, {}))).rejects.toSatisfy(isRedirect)
  })
})

describe('challenges', () => {
  it('posts the challenge as JSON', async () => {
    const calls: Array<Call> = []
    await sendChallenge(fakeFetch(200, { inviteId: INVITE }, calls), {
      opponentId: 8,
      timeControl: '3+2',
      color: 'random',
    })
    expect(calls).toEqual([
      {
        url: '/api/challenges',
        method: 'POST',
        body: JSON.stringify({ opponentId: 8, timeControl: '3+2', color: 'random' }),
      },
    ])
  })

  it('a refusal is an outcome with its reason', async () => {
    const refused = { errors: [{ reason: 'bob is playing.' }] }
    expect(
      await sendChallenge(fakeFetch(409, refused), {
        opponentId: 8,
        timeControl: '3+2',
        color: 'white',
      }),
    ).toEqual({ ok: false, status: 409, error: 'bob is playing.' })
  })

  it.each(['accept', 'decline', 'cancel'] as const)('%s posts to its path', async (answer) => {
    const calls: Array<Call> = []
    await answerChallenge(fakeFetch(200, { inviteId: INVITE }, calls), INVITE, answer)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST /api/challenges/${INVITE}/${answer}`,
    ])
  })
})
