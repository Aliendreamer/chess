import { vi } from 'vitest'
import type { LiveFrame } from '#/lib/live'
import type { LocalSocket } from '#/lib/server/hub-multiplexer'

/** A live frame whose payload echoes its seq, so a test can tell frames apart by value. */
export const frame = (topic: string, seq: number): LiveFrame => ({ topic, seq, payload: { seq } })

export type FakeSocket = LocalSocket & { sent: Array<unknown>; closed?: [number, string] }

/** A local (browser-facing) socket that records what it was sent (parsed as JSON) and how it was closed. */
export function fakeSocket(): FakeSocket {
  const sent: Array<unknown> = []
  const s: FakeSocket = {
    sent,
    send: vi.fn((data: string) => {
      sent.push(JSON.parse(data))
    }),
    close: (code, reason) => (s.closed = [code, reason]),
  }
  return s
}
