import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start' // activates the `server` route-option augmentation for tsc
import { downloadPgn } from '../../lib/server/pgn-download'

// A file download, not a page: the handler answers with the PGN (or a login bounce) and nothing renders.
export const Route = createFileRoute('/pgn/$id')({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { id: string } }) =>
        downloadPgn(request, params.id),
    },
  },
})
