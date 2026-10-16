import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { STANDARD_START, findLevel, levelOptions } from '@chess/core'
import {
  AnalysisQueue,
  EngineExited,
  EngineSupervisor,
  EngineTimeout,
  UciEngine,
  parseInfo,
} from './engine'
import type { UciChannel } from './engine'
import { processChannel } from '#/testing'

/**
 * A scripted UCI engine (as `Chess.Engine.Tests` does): it answers the handshake, prints two lines and a best move for
 * each `go` after `searchMs`, answers `stop` at once, and can exit during its n-th search.
 */
function fakeEngine(script: { searchMs?: number; exitOnSearch?: number; silent?: boolean } = {}) {
  const sent: Array<string> = []
  let lineListener: (line: string) => void = () => {}
  let exitListener: () => void = () => {}
  let searches = 0
  let pending: ReturnType<typeof setTimeout> | null = null
  const say = (...lines: Array<string>) =>
    queueMicrotask(() => lines.forEach((l) => lineListener(l)))
  const finish = () => {
    if (pending) clearTimeout(pending)
    pending = null
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
      if (line === 'uci') say('id name Fake', 'uciok')
      else if (line === 'isready') say('readyok')
      else if (line.startsWith('go')) {
        searches++
        if (searches === script.exitOnSearch) queueMicrotask(() => exitListener())
        else pending = setTimeout(finish, script.searchMs ?? 0)
      } else if (line === 'stop' && pending) finish()
      return Promise.resolve()
    },
    onLine: (l) => (lineListener = l),
    onExit: (l) => (exitListener = l),
    kill: () => Promise.resolve(),
  }
  return { channel, sent, searches: () => searches }
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
    const silent = new UciEngine(fakeEngine({ silent: true }).channel, { hashMb: 16, slackMs: 0 })
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

describe('the analysis queue (desktop-app D5)', () => {
  it('stops background work for the board, answers the board first, then asks the background again', async () => {
    const fake = fakeEngine({ searchMs: 200 })
    const queue = new AnalysisQueue(new EngineSupervisor(() => Promise.resolve(fake.channel)))
    const order: Array<string> = []
    const review = queue
      .analyse(STANDARD_START, 200, 1, 'background')
      .then(() => order.push('review'))
    await new Promise((r) => setTimeout(r, 30)) // the review's search has started
    const board = queue.analyse(AFTER_E4, 200, 3, 'board').then(() => order.push('board'))
    await Promise.all([review, board])
    expect(order).toEqual(['board', 'review'])
    expect(fake.sent).toContain('stop')
    expect(fake.searches()).toBe(3) // the review, stopped; the board; the review again
    expect(queue.pending('background')).toBe(0)
  })
})

// vitest runs from the app's root (jsdom has no file: import.meta.url).
const STOCKFISH = join(process.cwd(), 'src-tauri', 'binaries', 'stockfish-x86_64-unknown-linux-gnu')

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
