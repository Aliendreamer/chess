import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { metrics, propagation, trace } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import type { LiveFrame } from '../live'
import type * as Telemetry from './telemetry'

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const PARENT = `00-${TRACE_ID}-b7ad6b7169203331-01`
const COLLECTOR = 'http://otel-collector:4318'

const spans = new InMemorySpanExporter()
const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const reader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60_000,
})
let telemetry: typeof Telemetry

beforeAll(async () => {
  // Registered before the module loads, as the `--import` SDK is in the running BFF.
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] }),
  )
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }))
  telemetry = await import('./telemetry')
})

afterAll(() => {
  trace.disable()
  propagation.disable()
  metrics.disable()
})

type Call = { url: string; body: string; contentType: string | null }

function collector(calls: Array<Call>, status = 200): typeof fetch {
  return async (input, init) => {
    calls.push({
      url: String(input),
      body: await new Response(init?.body).text(),
      contentType: new Headers(init?.headers).get('content-type'),
    })
    return new Response(null, { status })
  }
}

function post(body: string, ip = '203.0.113.7', length?: number): Request {
  return new Request('http://app.chess.localhost/otel/v1/traces', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `${ip}, 172.30.0.2`,
      ...(length === undefined ? {} : { 'content-length': String(length) }),
    },
  })
}

describe('the browser trace route', () => {
  const on = { OTEL_ENABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: COLLECTOR }

  it('does not exist while telemetry is off', async () => {
    const calls: Array<Call> = []
    const forward = telemetry.createTraceForwarder({
      env: {},
      fetch: collector(calls),
      now: () => 0,
    })

    expect((await forward(post('{}'))).status).toBe(404)
    expect(calls).toEqual([])
  })

  it('forwards the spans unchanged to the collector', async () => {
    const calls: Array<Call> = []
    const forward = telemetry.createTraceForwarder({
      env: on,
      fetch: collector(calls),
      now: () => 0,
    })

    const res = await forward(post('{"resourceSpans":[]}'))

    expect(res.status).toBe(200)
    expect(calls).toEqual([
      {
        url: `${COLLECTOR}/v1/traces`,
        body: '{"resourceSpans":[]}',
        contentType: 'application/json',
      },
    ])
  })

  it('refuses a body over 256 KB, by header or by size, and forwards nothing', async () => {
    const calls: Array<Call> = []
    const forward = telemetry.createTraceForwarder({
      env: on,
      fetch: collector(calls),
      now: () => 0,
    })

    expect((await forward(post('{}', '203.0.113.8', 1024 * 1024))).status).toBe(413)
    expect((await forward(post('x'.repeat(256 * 1024 + 1), '203.0.113.8'))).status).toBe(413)
    expect(calls).toEqual([])
  })

  it('limits each client and lets it back after a minute', async () => {
    let now = 0
    const calls: Array<Call> = []
    const forward = telemetry.createTraceForwarder({
      env: on,
      fetch: collector(calls),
      now: () => now,
      perMinute: 2,
    })

    const statuses = [
      await forward(post('{}')),
      await forward(post('{}')),
      await forward(post('{}')),
    ].map((r) => r.status)
    const other = (await forward(post('{}', '198.51.100.1'))).status
    now = 60_001
    const later = (await forward(post('{}'))).status

    expect(statuses).toEqual([200, 200, 429])
    expect([other, later]).toEqual([200, 200])
  })
})

describe('frames on the relay', () => {
  const frame = (traceParent?: string): LiveFrame => ({
    topic: 'game:abc',
    seq: 3,
    payload: { ply: 2 },
    ...(traceParent ? { trace: traceParent } : {}),
  })

  it('are pushed in a span of the trace that made them, and reach browsers without it', () => {
    const delivered: Array<LiveFrame> = []

    telemetry.pushFrame(frame(PARENT), (f) => {
      delivered.push(f)
      return 2
    })

    const push = spans.getFinishedSpans().find((s) => s.name === 'relay.push game')!
    expect(push.spanContext().traceId).toBe(TRACE_ID)
    expect(push.parentSpanContext?.spanId).toBe('b7ad6b7169203331')
    expect(push.attributes['relay.sockets']).toBe(2)
    expect(delivered).toEqual([{ topic: 'game:abc', seq: 3, payload: { ply: 2 } }])
  })

  it('without a trace are still delivered, bare', () => {
    const delivered: Array<LiveFrame> = []
    telemetry.pushFrame(frame(), (f) => {
      delivered.push(f)
      return 1
    })
    expect(delivered).toEqual([{ topic: 'game:abc', seq: 3, payload: { ply: 2 } }])
    expect(telemetry.withoutTrace(frame(PARENT))).toEqual({
      topic: 'game:abc',
      seq: 3,
      payload: { ply: 2 },
    })
  })
})

describe('the chess.bff meter', () => {
  it('counts sockets, refusals, frames and hub reconnects', async () => {
    telemetry.bffMetrics.socketOpened()
    telemetry.bffMetrics.socketOpened()
    telemetry.bffMetrics.socketClosed()
    telemetry.bffMetrics.refused(4401)
    telemetry.bffMetrics.hubReconnected()
    telemetry.pushFrame({ topic: 'queue:5+3', seq: 1, payload: {} }, () => 3)

    await reader.forceFlush()
    const points = new Map(
      metricExporter
        .getMetrics()
        .flatMap((r) => r.scopeMetrics)
        .filter((s) => s.scope.name === 'chess.bff')
        .flatMap((s) => s.metrics)
        .map((m) => [m.descriptor.name, m.dataPoints] as const),
    )

    expect(points.get('chess.bff.sockets')?.[0]?.value).toBe(1)
    expect(points.get('chess.bff.refused')?.[0]).toMatchObject({
      value: 1,
      attributes: { code: 4401 },
    })
    expect(points.get('chess.bff.hub.reconnects')?.[0]?.value).toBe(1)
    expect(
      points.get('chess.bff.frames')?.find((p) => p.attributes['kind'] === 'queue')?.value,
    ).toBe(3)
  })
})
