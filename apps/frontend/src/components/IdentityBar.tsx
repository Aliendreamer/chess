import { LogOut, ShieldCheck, UserRound } from 'lucide-react'
import type { Me } from '#/lib/server/api-loaders'
import { ADMIN_ROLE, hasRole } from '#/lib/server/api-loaders'
import { LOGOUT_HREF } from '#/lib/auth/session'

export function IdentityBar({ me }: { me: Me }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-board-dark text-white">
          {hasRole(me, ADMIN_ROLE) ? <ShieldCheck size={18} /> : <UserRound size={18} />}
        </span>
        <div className="leading-tight">
          <p className="font-medium" data-testid="identity-email">
            {me.email ?? me.subject}
          </p>
          <p className="text-xs text-zinc-500" data-testid="identity-roles">
            {me.roles.length > 0 ? me.roles.join(' · ') : 'no roles'}
          </p>
        </div>
      </div>
      {/* A plain link, not an onClick: logout is a GET on the same-origin proxy and must work before
          hydration (SSR-first) and without JS at all. */}
      <a
        href={LOGOUT_HREF}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <LogOut size={16} /> Log out
      </a>
    </header>
  )
}
