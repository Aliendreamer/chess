import { ROOT_CONTEXT, SpanKind, context, metrics, propagation, trace } from '@opentelemetry/api'
import type { LiveFrame } from '../live'

/**
 * The BFF's own telemetry (observability D6–D7). Everything here goes through `@opentelemetry/api`, so with the SDK
 * not loaded (`OTEL_ENABLED` off, unit tests) it is a no-op; `otel/instrument.mjs` loads the SDK before the server.
 */

type Env = Record<string, string | undefined>

export const telemetryEnabled = (env: Env = process.env): boolean => env.OTEL_ENABLED === 'true'

const tracer = trace.getTracer('chess.bff')
const meter = metrics.getMeter('chess.bff')
const sockets = meter.createUpDownCounter('chess.bff.sockets', {
  description: 'Browser sockets open on the live relay',
})
const refusals = meter.createCounter('chess.bff.refused', {
  description: 'Browser sockets turned away, by close code',
})
const frames = meter.createCounter('chess.bff.frames', {
  description: 'Frames delivered to browser sockets, by kind',
})
const reconnects = meter.createCounter('chess.bff.hub.reconnects', {
  description: 'Reconnects of the shared hub connection',
})

export const bffMetrics = {
  socketOpened: () => sockets.add(1),
  socketClosed: () => sockets.add(-1),
  refused: (code: number) => refusals.add(1, { code }),
  hubReconnected: () => reconnects.add(1),
}

/** The frame as a browser gets it: the trace is the backend's and the BFF's business only. */
export function withoutTrace(frame: LiveFrame): LiveFrame {
  const { trace: _trace, ...bare } = frame
  return bare
}

/**
 * Delivers a pushed frame (`deliver` returns how many sockets got it) inside a `relay.push {kind}` span continuing the
 * trace that made the frame, so a move's trace ends at the other player's socket.
 */
export function pushFrame(frame: LiveFrame, deliver: (frame: LiveFrame) => number): void {
  const kind = frame.topic.split(':')[0] ?? 'unknown'
  const parent = frame.trace
    ? propagation.extract(ROOT_CONTEXT, { traceparent: frame.trace })
    : ROOT_CONTEXT
  const span = frame.trace
    ? tracer.startSpan(`relay.push ${kind}`, { kind: SpanKind.PRODUCER }, parent)
    : undefined
  const delivered = context.with(span ? trace.setSpan(parent, span) : parent, () =>
    deliver(withoutTrace(frame)),
  )
  frames.add(delivered, { kind })
  span?.setAttribute('relay.sockets', delivered)
  span?.end()
}

/** Spans a browser may send at once. */
export const MAX_TRACE_BODY = 256 * 1024

export interface TraceForwarderDeps {
  env: Env
  fetch: typeof fetch
  now: () => number
  /** Requests per client IP per minute. */
  perMinute?: number
}

/**
 * `POST /otel/v1/traces` (observability D7): the browser's spans, forwarded to the collector so the browser still talks
 * only to `app.`. Absent (404) while telemetry is off; a body over {@link MAX_TRACE_BODY} is refused (413); each client
 * IP gets `perMinute` requests (429 beyond). The body is forwarded as sent: the collector parses it.
 */
export function createTraceForwarder(
  deps: TraceForwarderDeps,
): (request: Request) => Promise<Response> {
  const perMinute = deps.perMinute ?? 120
  const windows = new Map<string, { start: number; count: number }>()

  function allowed(ip: string): boolean {
    const now = deps.now()
    const window = windows.get(ip)
    if (!window || now - window.start > 60_000) {
      if (windows.size > 10_000) windows.clear() // a flood of addresses must not grow the map without bound
      windows.set(ip, { start: now, count: 1 })
      return true
    }
    window.count++
    return window.count <= perMinute
  }

  return async (request) => {
    if (!telemetryEnabled(deps.env)) return new Response(null, { status: 404 })
    if (Number(request.headers.get('content-length') ?? 0) > MAX_TRACE_BODY)
      return new Response(null, { status: 413 })
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!allowed(ip)) return new Response(null, { status: 429 })
    const body = await request.arrayBuffer()
    if (body.byteLength > MAX_TRACE_BODY) return new Response(null, { status: 413 })
    const endpoint = deps.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'
    const res = await deps.fetch(`${endpoint}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body,
    })
    return new Response(null, { status: res.status })
  }
}
