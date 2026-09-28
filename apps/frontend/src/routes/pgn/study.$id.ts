import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start' // activates the `server` route-option augmentation for tsc
import { downloadStudyPgn } from '#/lib/server/studies'

// A file download, not a page: the study as PGN with its variations (or a login bounce).
export const Route = createFileRoute('/pgn/study/$id')({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { id: string } }) =>
        downloadStudyPgn(request, params.id),
    },
  },
})
