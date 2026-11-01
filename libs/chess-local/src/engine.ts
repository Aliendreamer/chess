import type { EvaluationLine } from '@chess/core'

/**
 * The bundled Stockfish (desktop-app D5), spoken to over UCI from TypeScript: a line channel to the process, the
 * conversation (ported from the engine worker's `Stockfish.cs`: handshake, best move at a strength, MultiPV analysis
 * with scores turned to White's side), and a supervisor that restarts a process that exits and asks again. The
 * analysis engine serves the board first: a board request stops whatever background work (review, mining) is running,
 * and that work is asked again afterwards.
 */

/** A line-based conversation with an engine process: the seam that lets the client be tested without a binary. */
export interface UciChannel {
  write: (line: string) => Promise<void>
  /** Called for each line the engine prints. */
  onLine: (listener: (line: string) => void) => void
  /** Called once when the process has ended. */
  onExit: (listener: () => void) => void
  kill: () => Promise<void>
}

export class EngineExited extends Error {
  constructor(waitingFor: string) {
    super(`The engine exited while waiting for '${waitingFor}'.`)
  }
}

export class EngineTimeout extends Error {}

/** The engine missed a deadline and did not quit when told: it cannot be stopped inside the app (mobile-app D13). */
export class EngineStuck extends Error {
  constructor() {
    super('Stockfish stopped responding. Close and reopen the app; your games are saved.')
  }
}

const HANDSHAKE_MS = 10_000

/** An analysis: the depth reached and the best lines, best first. */
export interface EngineAnalysis {
  depth: number
  lines: Array<EvaluationLine>
}

/** The UCI conversation with one engine process. Every wait has a deadline; an engine that exits is reported. */
export class UciEngine {
  private readonly lines: Array<string> = []
  private waiter: (() => void) | null = null
  private exited = false

  constructor(
    private readonly channel: UciChannel,
    private readonly options: { hashMb: number; slackMs: number } = {
      hashMb: 64,
      slackMs: 5_000,
    },
  ) {
    channel.onLine((line) => {
      this.lines.push(line)
      this.waiter?.()
    })
    channel.onExit(() => {
      this.exited = true
      this.waiter?.()
    })
  }

  get alive(): boolean {
    return !this.exited
  }

  async initialize(): Promise<void> {
    await this.channel.write('uci')
    await this.expect('uciok', HANDSHAKE_MS)
    await this.channel.write('setoption name Threads value 1')
    await this.channel.write(`setoption name Hash value ${this.options.hashMb}`)
    await this.ready()
  }

  /** The engine's move after thinking `thinkMs` at the strength `strength` sets, or null when it has none. */
  async bestMove(
    fen: string,
    strength: ReadonlyArray<string>,
    thinkMs: number,
  ): Promise<string | null> {
    await this.channel.write('ucinewgame')
    for (const option of strength) await this.channel.write(option)
    await this.ready()
    await this.channel.write(`position fen ${fen}`)
    await this.channel.write(`go movetime ${thinkMs}`)
    const line = await this.expect('bestmove', thinkMs + this.options.slackMs)
    const move = line.split(/\s+/)[1]
    return move && move !== '(none)' ? move : null
  }

  /** Full-strength analysis: `count` best lines after thinking `thinkMs` (or until {@link stop}). */
  async analyse(fen: string, thinkMs: number, count: number): Promise<EngineAnalysis> {
    await this.channel.write('ucinewgame')
    await this.channel.write('setoption name UCI_LimitStrength value false')
    await this.channel.write('setoption name Skill Level value 20')
    await this.channel.write(`setoption name MultiPV value ${count}`)
    await this.ready()
    await this.channel.write(`position fen ${fen}`)
    await this.channel.write(`go movetime ${thinkMs}`)
    const whiteToMove = fen.split(' ')[1] !== 'b'
    const best = new Map<number, EvaluationLine>()
    let depth = 0
    const deadline = Date.now() + thinkMs + this.options.slackMs
    for (;;) {
      const line = await this.next('bestmove', deadline)
      if (line.startsWith('bestmove')) {
        await this.channel.write('setoption name MultiPV value 1')
        return {
          depth,
          lines: [...best.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]),
        }
      }
      const parsed = parseInfo(line, whiteToMove)
      if (parsed) {
        best.set(parsed.multiPv, parsed.line)
        depth = Math.max(depth, parsed.depth)
      }
    }
  }

  /**
   * Tells the native bridge what the next search is for (mobile-app D13): a comment line it keeps for the crash
   * record and never passes to Stockfish.
   */
  mark(request: { kind: string; fen: string }): Promise<void> {
    return this.channel.write(`# request ${JSON.stringify(request)}`)
  }

  /** Ends the search in progress: the engine answers `bestmove` at once with what it has. */
  stop(): Promise<void> {
    return this.channel.write('stop')
  }

  async quit(): Promise<void> {
    if (this.exited) return
    await this.channel.write('quit').catch(() => undefined)
    await this.channel.kill().catch(() => undefined)
  }

  private async ready(): Promise<void> {
    await this.channel.write('isready')
    await this.expect('readyok', HANDSHAKE_MS)
  }

  /** Skips lines (`info …`) until one starts with `prefix`. */
  private async expect(prefix: string, withinMs: number): Promise<string> {
    const deadline = Date.now() + withinMs
    for (;;) {
      const line = await this.next(prefix, deadline)
      if (line.startsWith(prefix)) return line
    }
  }

  private async next(waitingFor: string, deadline: number): Promise<string> {
    for (;;) {
      const line = this.lines.shift()
      if (line !== undefined) return line
      if (this.exited) throw new EngineExited(waitingFor)
      const left = deadline - Date.now()
      if (left <= 0) throw new EngineTimeout(`The engine did not answer '${waitingFor}' in time.`)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left)
        this.waiter = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      this.waiter = null
    }
  }
}

/**
 * An `info … multipv k score cp|mate x … pv …` line, or null for anything else (and for bound scores, which are only
 * partial). The side to move's score is turned to White's.
 */
export function parseInfo(
  info: string,
  whiteToMove: boolean,
): { multiPv: number; depth: number; line: EvaluationLine } | null {
  const t = info.split(/\s+/).filter(Boolean)
  if (t[0] !== 'info' || info.includes('bound')) return null
  let multiPv = 1
  let depth = 0
  let cp: number | null = null
  let mate: number | null = null
  let pv: Array<string> = []
  for (let i = 1; i < t.length; i++) {
    if (t[i] === 'depth' && i + 1 < t.length) depth = Number(t[++i])
    else if (t[i] === 'multipv' && i + 1 < t.length) multiPv = Number(t[++i])
    else if (t[i] === 'score' && t[i + 1] === 'cp' && i + 2 < t.length) {
      cp = Number(t[i + 2])
      i += 2
    } else if (t[i] === 'score' && t[i + 1] === 'mate' && i + 2 < t.length) {
      mate = Number(t[i + 2])
      i += 2
    } else if (t[i] === 'pv') {
      pv = t.slice(i + 1)
      break
    }
  }
  if ((cp === null && mate === null) || pv.length === 0) return null
  const sign = whiteToMove ? 1 : -1
  return {
    multiPv,
    depth,
    line: {
      cp: cp === null ? null : cp * sign,
      mate: mate === null ? null : mate * sign,
      pv,
    },
  }
}

export type EngineStatus = 'starting' | 'ready' | 'restarting' | 'stuck'

/**
 * One engine process kept alive: started on first use, restarted when it exits or misses a deadline, and a request
 * that was cut short asked once more on the new engine. An engine that misses a deadline and does not quit within
 * `quitMs` is stuck (mobile-app D13: a thread inside the app cannot be killed): every request is refused from then on.
 * Requests run one at a time.
 */
export class EngineSupervisor {
  private engine: Promise<UciEngine> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private status: EngineStatus = 'starting'
  private readonly listeners = new Set<(status: EngineStatus) => void>()

  private stuck = false

  constructor(
    private readonly start: () => Promise<UciChannel>,
    private readonly options: { slackMs?: number; quitMs?: number } = {},
  ) {}

  get state(): EngineStatus {
    return this.status
  }

  /** Called on every status change: the page shows "engine restarting". */
  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Runs `work` on the engine after every request before it; once more on a restarted engine if the process exits. */
  run<T>(work: (engine: UciEngine) => Promise<T>): Promise<T> {
    const task = this.queue.then(
      () => this.attempt(work, true),
      () => this.attempt(work, true),
    )
    this.queue = task.catch(() => undefined)
    return task
  }

  /** The engine of the request running now, for {@link UciEngine.stop}; null when idle or starting. */
  async current(): Promise<UciEngine | null> {
    return this.engine ? this.engine.catch(() => null) : null
  }

  async shutdown(): Promise<void> {
    const engine = await this.current()
    this.engine = null
    await engine?.quit()
  }

  private async attempt<T>(work: (engine: UciEngine) => Promise<T>, retry: boolean): Promise<T> {
    if (this.stuck) throw new EngineStuck()
    const engine = await this.ensure()
    try {
      return await work(engine)
    } catch (e) {
      if (e instanceof EngineTimeout) {
        this.engine = null
        if (!(await settles(engine.quit(), this.options.quitMs ?? QUIT_MS))) {
          this.stuck = true
          this.setStatus('stuck')
          throw new EngineStuck()
        }
      } else if (!(e instanceof EngineExited)) throw e
      if (!retry) throw e
      this.engine = null
      this.setStatus('restarting')
      return this.attempt(work, false)
    }
  }

  private ensure(): Promise<UciEngine> {
    if (this.engine) return this.engine
    const starting = (async () => {
      const engine = new UciEngine(await this.start(), {
        hashMb: 64,
        slackMs: this.options.slackMs ?? 5_000,
      })
      await engine.initialize()
      this.setStatus('ready')
      return engine
    })()
    this.engine = starting
    starting.catch(() => {
      if (this.engine === starting) this.engine = null
    })
    return starting
  }

  private setStatus(status: EngineStatus) {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}

/**
 * Who is asking, most urgent first (mobile-app D7): the engine's move in a game, the board's analysis, a draw or resign
 * judgement, a game's review, the training miner.
 */
export const ENGINE_PRIORITIES = ['game', 'board', 'judgement', 'review', 'miner'] as const
export type EnginePriority = (typeof ENGINE_PRIORITIES)[number]
/** An analysis's priority: everything but a game's move. */
export type AnalysisPriority = Exclude<EnginePriority, 'game'>

interface EngineRequest {
  priority: EnginePriority
  work: (engine: UciEngine) => Promise<unknown>
  resolve: (answer: unknown) => void
  reject: (error: unknown) => void
}

/**
 * The engines' requests (desktop-app D5, mobile-app D7), served one at a time in priority order. A request more urgent
 * than the search running stops it, and the stopped one is asked again later: a stopped search's answer is never kept.
 * Options change only between searches, since each search sets its own before its `go` and searches never overlap.
 *
 * The desktop gives the games their own engine (`play`), so a move never waits for the analysis; the mobile app has one
 * engine for everything (Stockfish's state is process-wide), so the game's move comes first in the one queue.
 */
export class EngineScheduler {
  private readonly waiting = new Map<EnginePriority, Array<EngineRequest>>(
    ENGINE_PRIORITIES.map((p) => [p, []]),
  )
  private running: EngineRequest | null = null
  private stopped = false
  private held = false

  constructor(
    private readonly engines: { analysis: EngineSupervisor; play?: EngineSupervisor },
    /** Marks each search with its request for the native bridge's crash record (the mobile app). */
    private readonly options: { markRequests?: boolean } = {},
  ) {}

  /** The engine's move at a strength (`levelOptions`) after thinking `thinkMs`; null when it has none. */
  bestMove(fen: string, strength: ReadonlyArray<string>, thinkMs: number): Promise<string | null> {
    const work = this.marked('game', fen, (engine) => engine.bestMove(fen, strength, thinkMs))
    return this.engines.play ? this.engines.play.run(work) : this.enqueue('game', work)
  }

  /** Full-strength analysis: `lines` best lines after `thinkMs`. */
  analyse(
    fen: string,
    thinkMs: number,
    lines: number,
    priority: AnalysisPriority,
  ): Promise<EngineAnalysis> {
    return this.enqueue(
      priority,
      this.marked(priority, fen, (engine) => engine.analyse(fen, thinkMs, lines)),
    )
  }

  /** Requests waiting at a priority: the miner tops up only while little background work waits. */
  pending(priority: EnginePriority): number {
    return this.waiting.get(priority)!.length
  }

  /**
   * Stops the search running (asked again on {@link resume}) and starts nothing until then: the mobile app going to the
   * background, where the system may suspend it mid-search.
   */
  async hold(): Promise<void> {
    this.held = true
    await this.stopRunning()
  }

  resume(): void {
    this.held = false
    this.pump()
  }

  private marked<T>(
    kind: EnginePriority,
    fen: string,
    work: (engine: UciEngine) => Promise<T>,
  ): (engine: UciEngine) => Promise<T> {
    if (!this.options.markRequests) return work
    return async (engine) => {
      await engine.mark({ kind, fen })
      return work(engine)
    }
  }

  private enqueue<T>(
    priority: EnginePriority,
    work: (engine: UciEngine) => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting
        .get(priority)!
        .push({ priority, work, resolve: resolve as (answer: unknown) => void, reject })
      if (this.running && rank(priority) < rank(this.running.priority)) void this.stopRunning()
      this.pump()
    })
  }

  private async stopRunning(): Promise<void> {
    if (!this.running || this.stopped) return
    this.stopped = true
    const engine = await this.engines.analysis.current()
    await engine?.stop()
  }

  private pump() {
    if (this.running || this.held) return
    const next = ENGINE_PRIORITIES.map((p) => this.waiting.get(p)!)
      .find((q) => q.length > 0)
      ?.shift()
    if (!next) return
    this.running = next
    this.stopped = false
    void this.engines.analysis
      .run(next.work)
      .then(
        (answer) => {
          // A search that was stopped is asked again rather than kept half-done.
          if (this.stopped) this.waiting.get(next.priority)!.unshift(next)
          else next.resolve(answer)
        },
        (error: unknown) => next.reject(error),
      )
      .finally(() => {
        this.running = null
        this.stopped = false
        this.pump()
      })
  }
}

const rank = (priority: EnginePriority) => ENGINE_PRIORITIES.indexOf(priority)

/** How long a stuck engine is given to quit before it is called stuck. */
const QUIT_MS = 2_000

/** Whether `promise` settles within `ms`. */
function settles(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    promise.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(true)
      },
    )
  })
}
