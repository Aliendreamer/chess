import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { STANDARD_START, findLevel, levelOptions } from '@chess/core'
import {
  EngineExited,
  EngineScheduler,
  EngineStuck,
  EngineSupervisor,
  EngineTimeout,
  UciEngine,
  parseInfo,
} from './engine.ts'
import { processChannel } from './testing.ts'
import type { UciChannel } from './engine.ts'

/**
 * A scripted UCI engine (as `Chess.Engine.Tests` does): it answers the handshake, prints two lines and a best move for
 * each `go` after `searchMs`, answers `stop` at once, and can exit during its n-th search.
 */
function fakeEngine(script: { searchMs?: number; exitOnSearch?: number; silent?: boolean } = {}) {
  const sent: Array<string> = []
  let lineListener: (line: string) => void = () => {}
  let exitListener: () => void = () => {}
  let searches = 0
  let searching = false
  let optionsWhileSearching = 0
  let pending: ReturnType<typeof setTimeout> | null = null
  const say = (...lines: Array<string>) =>
    queueMicrotask(() => lines.forEach((l) => lineListener(l)))
  const finish = () => {
    if (pending) clearTimeout(pending)
    pending = null
    searching = false
    say(
      'info depth 12 multipv 1 score cp 35 nodes 1000 pv e2e4 e7e5',
      'info depth 12 multipv 2 score mate -3 nodes 1000 pv d2d4 d7d5',
      'bestmove e2e4 ponder e7e5',
    )
  }
  const channel: UciChannel = {
    write: (line) => {
      sent.push(line)
      if (script.silent) return Promise.resolve()
      if (line.startsWith('setoption') && searching) optionsWhileSearching++
      if (line === 'uci') say('id name Fake', 'uciok')
      else if (line === 'isready') say('readyok')
      else if (line.startsWith('go')) {
        searches++
        if (searches === script.exitOnSearch) queueMicrotask(() => exitListener())
        else {
          searching = true
          pending = setTimeout(finish, script.searchMs ?? 0)
        }
      } else if (line === 'stop' && pending) finish()
      return Promise.resolve()
    },
    onLine: (l) => (lineListener = l),
    onExit: (l) => (exitListener = l),
    kill: () => Promise.resolve(),
  }
  return {
    channel,
    sent,
    searches: () => searches,
    optionsWhileSearching: () => optionsWhileSearching,
  }
}

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('the UCI conversation (StockfishTests)', () => {
  it('shakes hands, then asks for a move at a strength and reads the best move', async () => {
    const fake = fakeEngine()
    const engine = new UciEngine(fake.channel)
    await engine.initialize()
    const move = await engine.bestMove(STANDARD_START, ['setoption name UCI_Elo value 1320'], 10)
    expect(move).toBe('e2e4')
    expect(fake.sent).toContain('setoption name UCI_Elo value 1320')
    expect(fake.sent).toContain(`position fen ${STANDARD_START}`)
    expect(fake.sent).toContain('go movetime 10')
  })

  it('analyses with several lines, scores turned to White’s side', async () => {
    const engine = new UciEngine(fakeEngine().channel)
    await engine.initialize()
    const analysis = await engine.analyse(AFTER_E4, 10, 2)
    expect(analysis.depth).toBe(12)
    // Black to move: +35 for Black is −35 for White; Black mating in 3 is mate −3 from Black's side → +3.
    expect(analysis.lines).toEqual([
      { cp: -35, mate: null, pv: ['e2e4', 'e7e5'] },
      { cp: null, mate: 3, pv: ['d2d4', 'd7d5'] },
    ])
  })

  it('reports an engine that exits and one that does not answer', async () => {
    const exiting = new UciEngine(fakeEngine({ exitOnSearch: 1 }).channel)
    await exiting.initialize()
    await expect(exiting.bestMove(STANDARD_START, [], 10)).rejects.toBeInstanceOf(EngineExited)
    expect(exiting.alive).toBe(false)
    const silent = new UciEngine(fakeEngine({ silent: true }).channel, {
      hashMb: 16,
      slackMs: 0,
    })
    const started = Date.now()
    await expect(
      Promise.race([
        silent.initialize(),
        new Promise((_, no) => setTimeout(() => no(new EngineTimeout('test')), 50)),
      ]),
    ).rejects.toBeInstanceOf(EngineTimeout)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('parses info lines, skipping bounds and lines without a score or moves', () => {
    expect(parseInfo('info depth 20 multipv 3 score cp -12 pv g1f3', true)).toEqual({
      multiPv: 3,
      depth: 20,
      line: { cp: -12, mate: null, pv: ['g1f3'] },
    })
    expect(parseInfo('info depth 20 score cp 30 lowerbound pv e2e4', true)).toBeNull()
    expect(parseInfo('info string NNUE enabled', true)).toBeNull()
    expect(parseInfo('info depth 5 score cp 10', true)).toBeNull()
    expect(parseInfo('bestmove e2e4', true)).toBeNull()
  })
})

describe('the supervisor (desktop-app D5)', () => {
  it('restarts an engine that exits mid-search and asks again', async () => {
    const first = fakeEngine({ exitOnSearch: 1 })
    const second = fakeEngine()
    const channels = [first.channel, second.channel]
    const supervisor = new EngineSupervisor(() => Promise.resolve(channels.shift()!))
    const statuses: Array<string> = []
    supervisor.subscribe((s) => statuses.push(s))
    const move = await supervisor.run((engine) => engine.bestMove(STANDARD_START, [], 10))
    expect(move).toBe('e2e4')
    expect(statuses).toEqual(['ready', 'restarting', 'ready'])
    expect(second.searches()).toBe(1)
  })

  it('gives up after one restart', async () => {
    const supervisor = new EngineSupervisor(() =>
      Promise.resolve(fakeEngine({ exitOnSearch: 1 }).channel),
    )
    await expect(
      supervisor.run((engine) => engine.bestMove(STANDARD_START, [], 10)),
    ).rejects.toBeInstanceOf(EngineExited)
  })

  it('runs requests one at a time', async () => {
    const fake = fakeEngine({ searchMs: 5 })
    const supervisor = new EngineSupervisor(() => Promise.resolve(fake.channel))
    const done: Array<number> = []
    await Promise.all(
      [1, 2, 3].map((n) =>
        supervisor.run((e) => e.bestMove(STANDARD_START, [], 5)).then(() => done.push(n)),
      ),
    )
    expect(done).toEqual([1, 2, 3])
  })
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const supervisor = (fake: ReturnType<typeof fakeEngine>) =>
  new EngineSupervisor(() => Promise.resolve(fake.channel))
const CASUAL = levelOptions(findLevel('1320')!)

describe('an engine that stops answering (mobile-app D13)', () => {
  it('is restarted when it misses a deadline, and the request asked again', async () => {
    let starts = 0
    const supervised = new EngineSupervisor(
      () => {
        starts++
        return Promise.resolve(fakeEngine({ searchMs: starts === 1 ? 10_000 : 10 }).channel)
      },
      { slackMs: 50, quitMs: 200 },
    )
    const move = await supervised.run((engine) => engine.bestMove(STANDARD_START, CASUAL, 10))
    expect(move).toBe('e2e4')
    expect(starts).toBe(2)
    expect(supervised.state).toBe('ready')
  })

  it('is stuck when it does not quit either, and refuses every request after', async () => {
    const fake = fakeEngine({ searchMs: 10_000 })
    const channel = { ...fake.channel, kill: () => new Promise<void>(() => undefined) }
    const supervised = new EngineSupervisor(() => Promise.resolve(channel), {
      slackMs: 50,
      quitMs: 100,
    })
    const states: Array<string> = []
    supervised.subscribe((s) => states.push(s))
    await expect(
      supervised.run((engine) => engine.bestMove(STANDARD_START, CASUAL, 10)),
    ).rejects.toBeInstanceOf(EngineStuck)
    expect(supervised.state).toBe('stuck')
    expect(states).toContain('stuck')
    await expect(
      supervised.run((engine) => engine.analyse(AFTER_E4, 10, 1)),
    ).rejects.toBeInstanceOf(EngineStuck)
  })
})

describe('the engine scheduler (desktop-app D5, mobile-app D7)', () => {
  it('stops a review for the board, answers the board first, then asks the review again', async () => {
    const fake = fakeEngine({ searchMs: 200 })
    const scheduler = new EngineScheduler({ analysis: supervisor(fake) })
    const order: Array<string> = []
    const review = scheduler
      .analyse(STANDARD_START, 200, 1, 'review')
      .then(() => order.push('review'))
    await wait(30) // the review's search has started
    const board = scheduler.analyse(AFTER_E4, 200, 3, 'board').then(() => order.push('board'))
    await Promise.all([review, board])
    expect(order).toEqual(['board', 'review'])
    expect(fake.sent).toContain('stop')
    expect(fake.searches()).toBe(3) // the review, stopped; the board; the review again
    expect(scheduler.pending('review')).toBe(0)
  })

  it('serves one engine in priority order: game, board, judgement, review, miner', async () => {
    const fake = fakeEngine({ searchMs: 50 })
    const scheduler = new EngineScheduler({ analysis: supervisor(fake) })
    const order: Array<string> = []
    const miner = scheduler.analyse(STANDARD_START, 50, 1, 'miner').then(() => order.push('miner'))
    await wait(20) // the miner's search has started
    const all = [
      scheduler.analyse(STANDARD_START, 50, 1, 'review').then(() => order.push('review')),
      scheduler.analyse(STANDARD_START, 50, 1, 'judgement').then(() => order.push('judgement')),
      scheduler.analyse(AFTER_E4, 50, 3, 'board').then(() => order.push('board')),
      scheduler.bestMove(STANDARD_START, CASUAL, 50).then(() => order.push('game')),
    ]
    await Promise.all([miner, ...all])
    expect(order).toEqual(['game', 'board', 'judgement', 'review', 'miner'])
  })

  it('changes options only while the engine is idle, game strength then full strength', async () => {
    const fake = fakeEngine({ searchMs: 100 })
    const scheduler = new EngineScheduler({ analysis: supervisor(fake) })
    const review = scheduler.analyse(STANDARD_START, 100, 3, 'review')
    await wait(30)
    const move = scheduler.bestMove(AFTER_E4, CASUAL, 100)
    await Promise.all([review, move])
    expect(fake.optionsWhileSearching()).toBe(0)
    const limit = fake.sent.lastIndexOf('setoption name UCI_LimitStrength value true')
    const full = fake.sent.lastIndexOf('setoption name UCI_LimitStrength value false')
    expect(limit).toBeGreaterThan(-1)
    expect(full).toBeGreaterThan(limit) // the review, asked again after the game's move
  })

  it('holds: stops the search, starts nothing, and asks it again on resume', async () => {
    const fake = fakeEngine({ searchMs: 100 })
    const scheduler = new EngineScheduler({ analysis: supervisor(fake) })
    let answered = false
    const board = scheduler.analyse(AFTER_E4, 100, 3, 'board').then((a) => {
      answered = true
      return a
    })
    await wait(30)
    await scheduler.hold()
    const review = scheduler.analyse(STANDARD_START, 100, 1, 'review')
    await wait(150)
    expect(answered).toBe(false)
    expect(fake.searches()).toBe(1)
    scheduler.resume()
    const analysis = await board
    await review
    expect(analysis.lines).toHaveLength(2)
    expect(fake.searches()).toBe(3) // the board, stopped; the board again; the review
  })

  it('writes the bridge’s own comment lines, which Stockfish never sees', async () => {
    const fake = fakeEngine()
    const engine = new UciEngine(fake.channel)
    await engine.note('crash-test')
    expect(fake.sent).toEqual(['# crash-test'])
  })

  it('marks each search with its request when asked to, for the crash record', async () => {
    const fake = fakeEngine({ searchMs: 10 })
    const scheduler = new EngineScheduler({ analysis: supervisor(fake) }, { markRequests: true })
    await scheduler.analyse(AFTER_E4, 10, 3, 'board')
    const mark = fake.sent.findIndex((l) => l.startsWith('# request '))
    expect(JSON.parse(fake.sent[mark]!.slice('# request '.length))).toEqual({
      kind: 'board',
      fen: AFTER_E4,
    })
    expect(fake.sent.findIndex((l) => l.startsWith('go'))).toBeGreaterThan(mark)
    const unmarked = fakeEngine({ searchMs: 10 })
    await new EngineScheduler({ analysis: supervisor(unmarked) }).analyse(AFTER_E4, 10, 3, 'board')
    expect(unmarked.sent.some((l) => l.startsWith('#'))).toBe(false)
  })

  it('plays on its own engine when it has one, beside the analysis', async () => {
    const play = fakeEngine({ searchMs: 50 })
    const analysis = fakeEngine({ searchMs: 50 })
    const scheduler = new EngineScheduler({
      play: supervisor(play),
      analysis: supervisor(analysis),
    })
    const [move] = await Promise.all([
      scheduler.bestMove(STANDARD_START, CASUAL, 50),
      scheduler.analyse(AFTER_E4, 50, 3, 'board'),
    ])
    expect(move).toBe('e2e4')
    expect(play.searches()).toBe(1)
    expect(analysis.searches()).toBe(1)
    expect(analysis.sent).not.toContain('stop')
  })
})

// The desktop's fetched sidecar (`nx run desktop:dev` fetches it once).
const STOCKFISH = join(
  import.meta.dirname,
  '../../../apps/desktop/src-tauri/binaries/stockfish-x86_64-unknown-linux-gnu',
)

describe.skipIf(!existsSync(STOCKFISH))('the fetched Stockfish', () => {
  it('plays a legal move at Casual and analyses with three lines', async () => {
    const engine = new UciEngine(await processChannel(STOCKFISH))
    try {
      await engine.initialize()
      const move = await engine.bestMove(STANDARD_START, levelOptions(findLevel('1320')!), 200)
      expect(new Chess().moves({ verbose: true }).map((m) => m.lan)).toContain(move)
      const analysis = await engine.analyse(AFTER_E4, 300, 3)
      expect(analysis.lines).toHaveLength(3)
      expect(analysis.depth).toBeGreaterThan(5)
    } finally {
      await engine.quit()
    }
  }, 30_000)
})
