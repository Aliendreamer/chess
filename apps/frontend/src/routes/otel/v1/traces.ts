import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start' // activates the `server` route-option augmentation for tsc
import { createTraceForwarder } from '#/lib/server/telemetry'

// PUBLIC and outside `/api` (which the edge sends to the backend): the browser's spans, forwarded to the collector so the
// browser never talks to another origin (observability D7). 404 while telemetry is off.
const forward = createTraceForwarder({
  env: process.env,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
})

export const Route = createFileRoute('/otel/v1/traces')({
  server: { handlers: { POST: ({ request }: { request: Request }) => forward(request) } },
})
