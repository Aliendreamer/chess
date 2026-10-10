import { describe, expect, it } from 'vitest'
import { answerTraining, loadTrainingNext, loadTrainingSummary, trainingQuery } from './training'

function fakeFetch(
  status: number,
  body: unknown,
  calls: Array<{ url: string; init?: RequestInit | undefined }> = [],
): typeof fetch {
  return (input, init) => {
    calls.push({ url: String(input), init })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

const P = `p:${'a'.repeat(32)}`
const G = `g:${'b'.repeat(32)}:23`

describe('training query', () => {
  it('sends master-game filters as the API names them, and the seen ids as one list', () => {
    const query = new URLSearchParams(
      trainingQuery(
        'library',
        { opening: 'B9', phase: 'endgame', player: 'Carlsen', from: 1990, to: 2020 },
        [P, `p:${'c'.repeat(32)}`],
      ),
    )
    expect(Object.fromEntries(query)).toEqual({
      mode: 'library',
      eco: 'B9',
      phase: 'endgame',
      player: 'Carlsen',
      from: '1990',
      to: '2020',
      exclude: `${P},p:${'c'.repeat(32)}`,
    })
  })

  it('never sends filters for the member’s own games, nor an empty exclude', () => {
    expect(trainingQuery('games', { opening: 'B9', phase: 'endgame' }, [])).toBe('mode=games')
  })
})

describe('training reads and answers', () => {
  it('asks for the next position', async () => {
    const calls: Array<{ url: string }> = []
    const next = await loadTrainingNext(fakeFetch(200, { item: null, pool: 0 }, calls), {
      mode: 'games',
      filters: {},
      exclude: [G],
    })
    expect(next).toEqual({ item: null, pool: 0 })
    expect(calls[0]?.url).toBe(`/api/training/next?mode=games&exclude=${encodeURIComponent(G)}`)
  })

  it('posts an answer; a refusal is an outcome', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
    const outcome = await answerTraining(fakeFetch(200, { correct: true }, calls), {
      mode: 'library',
      id: P,
      uci: 'e2e4',
    })
    expect(outcome).toEqual({ ok: true, view: { correct: true } })
    expect(calls[0]?.url).toBe('/api/training/answer')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      mode: 'library',
      id: P,
      uci: 'e2e4',
    })
    const refused = await answerTraining(
      fakeFetch(404, { errors: [{ reason: 'Unknown position.' }] }),
      { mode: 'library', id: P, uci: 'e2e4' },
    )
    expect(refused).toEqual({ ok: false, status: 404, error: 'Unknown position.' })
  })

  it('reads the summary; a failure throws', async () => {
    const calls: Array<{ url: string }> = []
    await loadTrainingSummary(fakeFetch(200, {}, calls))
    expect(calls[0]?.url).toBe('/api/training/summary')
    await expect(loadTrainingSummary(fakeFetch(500, {}))).rejects.toThrow(/500/)
  })
})
