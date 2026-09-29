// The BFF's OpenTelemetry SDK (observability D7), loaded before the server with `node --import ./otel/instrument.mjs`
// (`dev:stack` and `start`). Off unless OTEL_ENABLED=true: then nothing below loads and the process runs bare.
//
// Traces: every incoming request (server functions, pages, the relay's upgrade) and every outgoing fetch — undici
// carries `traceparent` to the API, so the backend's span joins the BFF's trace. Metrics: the `chess.bff` meter and
// Node's runtime (event-loop lag, heap, GC). Profiles: Pyroscope's Node agent when PYROSCOPE_SERVER_ADDRESS is set.
import os from 'node:os'

if (process.env.OTEL_ENABLED === 'true') {
  // ESM modules (the server, node:http) are patched through this loader hook, not require().
  const { register } = await import('node:module')
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)

  const { NodeSDK } = await import('@opentelemetry/sdk-node')
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
  const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http')
  const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics')
  const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http')
  const { UndiciInstrumentation } = await import('@opentelemetry/instrumentation-undici')
  const { RuntimeNodeInstrumentation } = await import('@opentelemetry/instrumentation-runtime-node')
  const { resourceFromAttributes } = await import('@opentelemetry/resources')
  const { ParentBasedSampler, TraceIdRatioBasedSampler } =
    await import('@opentelemetry/sdk-trace-base')

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'
  const instance = process.env.OTEL_SERVICE_INSTANCE ?? os.hostname()
  // Vite's module and asset requests in dev are noise, not requests anyone made.
  const ignored = /^\/(@|node_modules\/|src\/|assets\/|favicon)|\.(js|css|map|svg|png|woff2?)(\?|$)/
  // A path's ids would make every span name unique: /games/0199… → /games/{id}. A server function's path is base64 of
  // {"file":…,"export":"postGameCommand_createServerFn_handler"}: name it after the function instead.
  const templated = (path) => {
    const bare = path.split('?')[0]
    if (bare.startsWith('/_serverFn/')) {
      try {
        const fn = JSON.parse(
          Buffer.from(bare.slice('/_serverFn/'.length), 'base64url').toString(),
        ).export
        return `serverFn ${String(fn).replace(/_createServerFn_handler$/, '')}`
      } catch {
        return 'serverFn'
      }
    }
    return bare.replace(/\/[0-9a-f]{32}\b|\/[0-9a-f-]{36}\b/gi, '/{id}')
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': 'chess-frontend',
      'service.instance.id': instance,
      'deployment.environment': process.env.OTEL_ENVIRONMENT ?? 'local',
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(Number(process.env.OTEL_SAMPLE_RATIO ?? 1)),
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => ignored.test(req.url ?? ''),
        // The browser's own spans come in here; exporting them must not make spans of its own.
        ignoreOutgoingRequestHook: (req) => (req.path ?? '').startsWith('/v1/'),
        requestHook: (span, req) => {
          if ('method' in req && 'url' in req && typeof req.url === 'string') {
            const name = templated(req.url)
            span.updateName(name.startsWith('serverFn') ? name : `${req.method} ${name}`)
          }
        },
      }),
      new UndiciInstrumentation({
        ignoreRequestHook: (req) => req.origin === endpoint,
        requestHook: (span, req) => span.updateName(`${req.method} ${templated(req.path)}`),
      }),
      new RuntimeNodeInstrumentation(),
    ],
  })
  sdk.start()

  if (process.env.PYROSCOPE_SERVER_ADDRESS) {
    const Pyroscope = (await import('@pyroscope/nodejs')).default
    Pyroscope.init({
      serverAddress: process.env.PYROSCOPE_SERVER_ADDRESS,
      appName: 'chess-frontend',
      tags: { service_instance_id: instance },
    })
    Pyroscope.start()
  }

  const stop = () => void sdk.shutdown().finally(() => process.exit(0))
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
