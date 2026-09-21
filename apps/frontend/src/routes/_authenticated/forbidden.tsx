import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/forbidden')({
  component: Forbidden,
})

function Forbidden() {
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-950">
      <h1 className="text-xl font-semibold">Not allowed</h1>
      <p className="mt-2 text-sm">Your account does not have the role this page needs.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Back to the dashboard
      </Link>
    </section>
  )
}
