import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch'
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load'
import { resourceFromAttributes } from '@opentelemetry/resources'

/**
 * The browser's part of a trace (observability D7): the page load and every same-origin fetch — server functions
 * included, which carry `traceparent` into the BFF. Spans go to `/otel/v1/traces` on `app.` (the BFF forwards them),
 * never to another origin. Loaded lazily, and only when the root loader says telemetry is on.
 */
let started = false

export function startBrowserTracing(): void {
  if (started) return
  started = true
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'chess-frontend-web' }),
    // Sent every second, and whenever the page is hidden or left: a click's spans must not die with the tab.
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: '/otel/v1/traces' }), {
        scheduledDelayMillis: 1000,
      }),
    ],
  })
  provider.register()
  const flush = () => void provider.forceFlush()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      // Same-origin requests get `traceparent` by default; exporting spans must not make spans of its own.
      new FetchInstrumentation({
        ignoreUrls: [/\/otel\/v1\/traces/],
        applyCustomAttributesOnSpan: (span, request) => {
          const url = request instanceof Request ? request.url : ''
          const fn = serverFnName(url)
          if (fn) span.updateName(`serverFn ${fn}`)
        },
      }),
    ],
  })
}

/**
 * A server function's URL is `/_serverFn/<base64 of {"export":"postGameCommand_createServerFn_handler",…}>`: its span
 * is named after the function, as the BFF names its own.
 */
export function serverFnName(url: string): string | null {
  const marker = '/_serverFn/'
  const at = url.indexOf(marker)
  if (at < 0) return null
  try {
    const encoded = url.slice(at + marker.length).split(/[?#]/)[0] ?? ''
    const json = atob(encoded.replaceAll('-', '+').replaceAll('_', '/')) // base64url → base64
    const name = (JSON.parse(json) as { export?: unknown }).export
    return typeof name === 'string' ? name.replace(/_createServerFn_handler$/, '') : null
  } catch {
    return null
  }
}
