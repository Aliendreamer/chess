import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start' // activates the `server` route-option augmentation for tsc
import { proxyAuth } from '../../../lib/server/auth-proxy'

// PUBLIC: deliberately outside `_authenticated` — login must be reachable while anonymous.
const handler = ({ request, params }: { request: Request; params: { _splat?: string } }) =>
  proxyAuth(request, params._splat ?? '')

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handler, POST: handler } },
})
