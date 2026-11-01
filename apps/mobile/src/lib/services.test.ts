import { EngineScheduler, getSetting, isFailedPosition } from '@chess/local'
import { testPlatform as platform } from '@/testing/platform'
import { libraryProgress, startServices } from './services'

const FEN = '8/8/8/8/8/8/8/K6k w - - 0 1'

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

test('the library’s first load says how far it has got, and nothing once it is done', async () => {
  const { p } = platform()
  const services = await startServices(p)
  const seen: Array<number | null> = [services.libraryProgress.current()]
  const unsubscribe = services.libraryProgress.subscribe(() =>
    seen.push(services.libraryProgress.current()),
  )
  await services.library
  unsubscribe()
  expect(seen.at(-1)).toBeNull()
  services.dispose()
})

test('progress is a share of the games, and a library with none shows none', () => {
  const progress = libraryProgress()
  const heard: Array<number | null> = []
  progress.subscribe(() => heard.push(progress.current()))
  progress.report(0, 4)
  progress.report(1, 4)
  progress.report(4, 4)
  progress.report(0, 0)
  progress.done()
  expect(heard).toEqual([0, 0.25, 1, null, null])
})
