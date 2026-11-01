import { nativeChannel, takeCrashFiles } from './engine'
import type { StockfishNative } from './engine'

/** A stand-in for the native module: records what it is sent and emits what the test says. */
function fakeModule() {
  const sent: Array<string> = []
  const listeners: Record<string, Array<(e: never) => void>> = { lines: [], exit: [] }
  let starts = 0
  const module: StockfishNative = {
    start: async () => ++starts === 1,
    send: (line) => void sent.push(line),
    quit: async () => listeners.exit.forEach((l) => l({ reason: 'quit' } as never)),
    takeCrashFiles: () => ({ crash: null, marker: null }),
    addListener: (event, listener) => {
      listeners[event]!.push(listener as (e: never) => void)
      return {
        remove: () => {
          listeners[event] = listeners[event]!.filter((l) => l !== listener)
        },
      }
    },
  }
  const emit = (lines: Array<string>) => listeners.lines.forEach((l) => l({ lines } as never))
  return { module, sent, emit, listeners }
}

test('carries UCI lines both ways, the batches unpacked in order', async () => {
  const fake = fakeModule()
  const channel = await nativeChannel(fake.module)
  const got: Array<string> = []
  channel.onLine((line) => got.push(line))
  await channel.write('uci')
  fake.emit(['id name Stockfish 19', 'uciok'])
  fake.emit(['info depth 9 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4'])
  expect(fake.sent).toEqual(['uci'])
  expect(got).toEqual([
    'id name Stockfish 19',
    'uciok',
    'info depth 9 multipv 1 score cp 20 pv e2e4',
    'bestmove e2e4',
  ])
})

test('ends on quit: the exit is reported once and nothing more arrives', async () => {
  const fake = fakeModule()
  const channel = await nativeChannel(fake.module)
  const got: Array<string> = []
  let exits = 0
  channel.onLine((line) => got.push(line))
  channel.onExit(() => exits++)
  await channel.kill()
  fake.emit(['bestmove a2a3'])
  expect(exits).toBe(1)
  expect(got).toEqual([])
  expect(fake.listeners.lines).toHaveLength(0)
})

test('refuses a second engine while one runs', async () => {
  const fake = fakeModule()
  await nativeChannel(fake.module)
  await expect(nativeChannel(fake.module)).rejects.toThrow('already running')
})

test('reads what the last run left: the crash record parsed, the time as ISO', () => {
  const module = {
    ...fakeModule().module,
    takeCrashFiles: () => ({
      crash:
        '{"signal":"SIGSEGV","atMs":1793534400000,"request":{"kind":"review","fen":"8/8/8/8/8/8/8/K6k w - - 0 1"}}',
      marker: '{"kind":"review","fen":"8/8/8/8/8/8/8/K6k w - - 0 1"}',
    }),
  }
  expect(takeCrashFiles(module)).toEqual({
    crash: {
      signal: 'SIGSEGV',
      at: '2026-11-01T12:00:00.000Z',
      request: { kind: 'review', fen: '8/8/8/8/8/8/8/K6k w - - 0 1' },
    },
    marker: { kind: 'review', fen: '8/8/8/8/8/8/8/K6k w - - 0 1' },
  })
  expect(
    takeCrashFiles({ ...module, takeCrashFiles: () => ({ crash: '{broken', marker: null }) }),
  ).toEqual({
    crash: null,
    marker: null,
  })
})
