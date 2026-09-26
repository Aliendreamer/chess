import { describe, expect, it } from 'vitest'
import { applyFrame, parseSocketMessage } from './live'
import { frame } from '#/test/live-fakes'

const f = (seq: number) => frame('ping:p1', seq)

describe('parseSocketMessage', () => {
  it('accepts a frame and an error', () => {
    expect(parseSocketMessage(JSON.stringify({ kind: 'frame', frame: f(3) }))).toEqual({
      kind: 'frame',
      frame: f(3),
    })
    expect(parseSocketMessage(JSON.stringify({ kind: 'error', message: 'down' }))).toEqual({
      kind: 'error',
      message: 'down',
    })
  })

  it.each([
    'not json',
    'null',
    '{"kind":"frame"}',
    '{"kind":"frame","frame":{"topic":"ping:p1","seq":"7","payload":{}}}',
    '{"kind":"frame","frame":{"seq":7,"payload":{}}}',
    '{"kind":"frame","frame":{"topic":"ping:p1","seq":7}}',
    '{"kind":"other"}',
  ])('drops junk: %s', (data) => {
    expect(parseSocketMessage(data)).toBeNull()
  })
})

describe('applyFrame', () => {
  it('takes the first frame', () => {
    expect(applyFrame(undefined, f(7))).toEqual(f(7))
  })

  it('moves forward only', () => {
    const f7 = f(7)
    const f8 = f(8)
    expect(applyFrame(f7, f8)).toBe(f8)
    expect(applyFrame(f8, f7)).toBe(f8)
  })

  it('keeps the current frame on a duplicate seq', () => {
    const current = f(8)
    expect(applyFrame(current, f(8))).toBe(current)
  })
})
