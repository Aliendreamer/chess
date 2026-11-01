import { EngineScheduler, getSetting, isFailedPosition } from '@chess/local'
import { expoSql } from '@/platform/sql'
import { nodeDatabase } from '@/testing/node-sql'
import { startServices } from './services'
import type { Platform } from './services'
import type { UciChannel } from '@chess/local'

const FEN = '8/8/8/8/8/8/8/K6k w - - 0 1'

function platform(overrides: Partial<Platform> = {}) {
  const native = nodeDatabase()
  const appListeners: Array<(state: string) => void> = []
  const fetched: Array<string> = []
  const channel: UciChannel = {
    write: () => Promise.resolve(),
    onLine: () => {},
    onExit: () => {},
    kill: () => Promise.resolve(),
  }
  const p: Platform = {
    sql: expoSql(native),
    backupPath: (v) => `/data/chess.db.before-v${v}`,
    channel: () => Promise.resolve(channel),
    assets: {
      openings: () => Promise.resolve(["eco\tname\tpgn\nB00\tKing's Pawn\t1. e4"]),
      bundledLibrary: () =>
        Promise.resolve(
          new TextEncoder().encode('{"format":1,"games":[],"candidates":[],"positions":[]}'),
        ),
    },
    fetchText: (url) => {
      fetched.push(url)
      return Promise.resolve({ status: 200, text: '<rss version="2.0"><channel></channel></rss>' })
    },
    openLink: () => Promise.resolve(),
    appState: {
      addEventListener: (_type, listener) => {
        appListeners.push(listener)
        return { remove: () => undefined }
      },
    },
    crashFiles: () => ({ crash: null, marker: null }),
    ...overrides,
  }
  return { p, native, fetched, goTo: (state: string) => appListeners.forEach((l) => l(state)) }
}

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('records a crash before the engine is used, and says so', async () => {
  const { p, native } = platform({
    crashFiles: () => ({
      crash: {
        signal: 'SIGSEGV',
        at: '2026-11-01T10:00:00.000Z',
        request: { kind: 'review', fen: FEN },
      },
      marker: { kind: 'review', fen: FEN },
    }),
  })
  const services = await startServices(p)
  expect(services.crash).toMatchObject({ kind: 'review', signal: 'SIGSEGV' })
  expect(await isFailedPosition(services.db, FEN)).toBe(true)
  services.dispose()
  native.close()
})

test('the miner is off until the player turns it on', async () => {
  const { p, native } = platform()
  const services = await startServices(p)
  expect(await getSetting(services.db, 'training.miner', null)).toBe(null)
  await expect(services.minerOn()).resolves.toBe(false)
  services.dispose()
  native.close()
})

test('in the background the engine holds and the news stops; back in front both resume', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
  const hold = jest.spyOn(EngineScheduler.prototype, 'hold')
  const resume = jest.spyOn(EngineScheduler.prototype, 'resume')
  const { p, native, fetched, goTo } = platform()
  const services = await startServices(p)
  await jest.advanceTimersByTimeAsync(5_000)
  const first = fetched.length
  expect(first).toBeGreaterThan(0)

  goTo('background')
  expect(hold).toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(3 * 60 * 60_000)
  expect(fetched.length).toBe(first)

  goTo('active')
  expect(resume).toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(5_000)
  expect(fetched.length).toBeGreaterThan(first)
  services.dispose()
  native.close()
})
