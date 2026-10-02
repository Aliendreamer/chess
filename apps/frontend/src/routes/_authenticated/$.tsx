import { createFileRoute, notFound } from '@tanstack/react-router'
import { pageTitle } from '#/lib/feedback'

/**
 * Any address no other route takes (ui-polish): the not-found page inside the shell, after sign-in. Without this the
 * root would answer it, outside the layout. More specific routes (`/api/…`, `/pgn/…`) always win over this splat.
 */
export const Route = createFileRoute('/_authenticated/$')({
  loader: () => {
    throw notFound()
  },
  head: () => ({ meta: [{ title: pageTitle('Not found') }] }),
})
