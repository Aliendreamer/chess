import type { ReactNode } from 'react'

export interface TileProps {
  title: string
  error: boolean
  children?: ReactNode
}

/** One dashboard card; an errored source degrades this tile only. */
export function Tile({ title, error, children }: TileProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {error ? (
        <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
          Unavailable right now.
        </p>
      ) : (
        children
      )}
    </section>
  )
}
