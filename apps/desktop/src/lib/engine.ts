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
    private readonly options: { hashMb: number; slackMs: number } = { hashMb: 64, slackMs: 5_000 },
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
        return { depth, lines: [...best.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]) }
      }
      const parsed = parseInfo(line, whiteToMove)
      if (parsed) {
        best.set(parsed.multiPv, parsed.line)
        depth = Math.max(depth, parsed.depth)
      }
    }
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
    line: { cp: cp === null ? null : cp * sign, mate: mate === null ? null : mate * sign, pv },
  }
}

export type EngineStatus = 'starting' | 'ready' | 'restarting'

/**
 * One engine process kept alive: started on first use, restarted when it exits, and a request that the exit cut short
 * asked once more on the new process. Requests run one at a time.
 */
export class EngineSupervisor {
  private engine: Promise<UciEngine> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private status: EngineStatus = 'starting'
  private readonly listeners = new Set<(status: EngineStatus) => void>()

  constructor(private readonly start: () => Promise<UciChannel>) {}

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
    const engine = await this.ensure()
    try {
      return await work(engine)
    } catch (e) {
      if (!(e instanceof EngineExited) || !retry) throw e
      this.engine = null
      this.setStatus('restarting')
      return this.attempt(work, false)
    }
  }

  private ensure(): Promise<UciEngine> {
    if (this.engine) return this.engine
    const starting = (async () => {
      const engine = new UciEngine(await this.start())
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

export type AnalysisPriority = 'board' | 'background'

interface AnalysisRequest {
  fen: string
  thinkMs: number
  lines: number
  priority: AnalysisPriority
  resolve: (analysis: EngineAnalysis) => void
  reject: (error: unknown) => void
}

/**
 * The analysis engine's requests (desktop-app D5): the board's first, in order; background work (review, mining) when
 * the board asks for nothing. A board request arriving during a background search stops it, and that search is asked
 * again later — a stopped search's partial answer is never kept.
 */
export class AnalysisQueue {
  private readonly board: Array<AnalysisRequest> = []
  private readonly background: Array<AnalysisRequest> = []
  private running: AnalysisRequest | null = null

  constructor(private readonly supervisor: EngineSupervisor) {}

  analyse(
    fen: string,
    thinkMs: number,
    lines: number,
    priority: AnalysisPriority,
  ): Promise<EngineAnalysis> {
    return new Promise((resolve, reject) => {
      const request = { fen, thinkMs, lines, priority, resolve, reject }
      ;(priority === 'board' ? this.board : this.background).push(request)
      if (priority === 'board' && this.running?.priority === 'background') {
        void this.supervisor.current().then((engine) => engine?.stop())
      }
      this.pump()
    })
  }

  /** Requests waiting, by priority: the miner tops up only while little background work waits. */
  pending(priority: AnalysisPriority): number {
    return (priority === 'board' ? this.board : this.background).length
  }

  private pump() {
    if (this.running) return
    const next = this.board.shift() ?? this.background.shift()
    if (!next) return
    this.running = next
    void this.supervisor
      .run((engine) => engine.analyse(next.fen, next.thinkMs, next.lines))
      .then(
        (analysis) => {
          // A background search the board stopped is asked again rather than kept half-done.
          if (next.priority === 'background' && this.board.length > 0) this.background.unshift(next)
          else next.resolve(analysis)
        },
        (error: unknown) => next.reject(error),
      )
      .finally(() => {
        this.running = null
        this.pump()
      })
  }
}

/** The bundled Stockfish as a {@link UciChannel}, through Tauri's shell plugin; loaded lazily, so tests never import it. */
export async function sidecarChannel(): Promise<UciChannel> {
  const { Command } = await import('@tauri-apps/plugin-shell')
  const command = Command.sidecar('binaries/stockfish')
  const lineListeners: Array<(line: string) => void> = []
  const exitListeners: Array<() => void> = []
  command.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) if (line !== '') lineListeners.forEach((l) => l(line))
  })
  command.on('close', () => exitListeners.forEach((l) => l()))
  command.on('error', () => exitListeners.forEach((l) => l()))
  const child = await command.spawn()
  return {
    write: (line) => child.write(`${line}\n`),
    onLine: (listener) => lineListeners.push(listener),
    onExit: (listener) => exitListeners.push(listener),
    kill: () => child.kill(),
  }
}
