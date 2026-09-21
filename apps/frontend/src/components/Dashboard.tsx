import { Tile } from './Tile'
import type { Health, Me, Settled } from '#/lib/server/api-loaders'

export interface DashboardProps {
  me: Me
  health: Settled<Health>
}

/** Presentational: everything arrives resolved from the route loader; no fetching, no loading state. */
export function Dashboard({ me, health }: DashboardProps) {
  const greeting = me.email?.split('@')[0] ?? me.subject
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="sm:col-span-2">
        <h1 className="text-2xl font-semibold">Hello, {greeting}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rendered on the server with your session. No spinners.
        </p>
      </section>
      <Tile title="Your identity" error={false}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Subject</dt>
          <dd className="truncate font-mono" data-testid="me-subject">
            {me.subject}
          </dd>
          <dt className="text-zinc-500">User id</dt>
          <dd data-testid="me-id">{me.id}</dd>
          <dt className="text-zinc-500">Roles</dt>
          <dd>{me.roles.length > 0 ? me.roles.join(', ') : '—'}</dd>
        </dl>
      </Tile>
      <Tile title="API health" error={health.error}>
        {health.data ? (
          <p className="text-sm" data-testid="health-status">
            <span className="mr-2 inline-block size-2 rounded-full bg-emerald-500" aria-hidden />
            {health.data.status}{' '}
            <span className="text-zinc-500">· checked {health.data.checkedAt}</span>
          </p>
        ) : null}
      </Tile>
    </div>
  )
}
