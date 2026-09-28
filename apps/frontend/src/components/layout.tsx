import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Me } from '#/lib/auth'
import type { LinkProps } from '@tanstack/react-router'
import { LOGOUT_HREF } from '#/lib/auth'

/** The Club layout: a 248px rail (wordmark, navigation, who you are) and the content column. */
export function Shell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[var(--rail-width)_minmax(0,1fr)]">
      <aside className="flex flex-col gap-7 border-r border-line-divider bg-surface-rail px-4 py-6">
        <Wordmark />
        <NavGroup label="Play">
          <NavItem to="/" label="Home" />
        </NavGroup>
        <NavGroup label="Games">
          <NavItem to="/games" label="History" />
          <NavItem to="/studies" label="Studies" />
        </NavGroup>
        <div className="mt-auto flex items-center gap-2.5 px-2">
          <div
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-full bg-board-dark font-semibold text-fg-primary"
          >
            {me.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium" data-testid="identity-name">
              {me.username}
            </span>
            {/* A plain link, not an onClick: logout is a GET on the same-origin proxy and must work before
                hydration (SSR-first) and without JS at all. */}
            <a href={LOGOUT_HREF} className="text-xs text-fg-muted no-underline hover:text-fg-body">
              Log out
            </a>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-10 py-8">
        <div className="mx-auto max-w-(--content-max)">{children}</div>
      </main>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="px-2">
      <span className="font-display text-[30px] leading-none text-fg-primary italic">Chess</span>
    </div>
  )
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      <div className="px-2 pb-1.5 text-2xs tracking-eyebrow text-fg-muted uppercase">{label}</div>
      {children}
    </nav>
  )
}

interface NavItemProps {
  to: NonNullable<LinkProps['to']>
  label: string
}

/** A router link; the router marks the current one (`data-status="active"`), styled as selected. */
function NavItem({ to, label }: NavItemProps) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex w-full items-center gap-2 rounded-control p-2 text-base text-fg-body no-underline transition-colors duration-[120ms] hover:bg-surface-hover hover:text-fg-body data-[status=active]:bg-surface-selected data-[status=active]:text-fg-primary"
    >
      {label}
    </Link>
  )
}
