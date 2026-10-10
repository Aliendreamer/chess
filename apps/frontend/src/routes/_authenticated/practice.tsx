import { createFileRoute, redirect } from '@tanstack/react-router'

/** Practice became training (training): the old address goes to `/training`. */
export const Route = createFileRoute('/_authenticated/practice')({
  beforeLoad: () => {
    throw redirect({ to: '/training', replace: true })
  },
})
