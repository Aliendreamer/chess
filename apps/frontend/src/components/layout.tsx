import { Link } from '@tanstack/react-router'
import { BookOpen, History, House, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Me, Preferences } from '#/lib/auth'
import type { LinkProps } from '@tanstack/react-router'
import { DEFAULT_PREFERENCES, LOGOUT_HREF, PreferencesContext } from '#/lib/auth'

/**
 * The Club layout: a 248px rail (wordmark, navigation, who you are) and the content column. The user's preferences
 * (user-preferences) are applied here, on the server-rendered root: `data-board` picks the board theme, `data-theme`
 * the site theme, and the board reads animation and coordinates from the context.
 */
export function Shell({
  me,
  prefs = DEFAULT_PREFERENCES,
  children,
}: {
  me: Me
  prefs?: Preferences
  children: ReactNode
}) {
  return (
    <PreferencesContext value={prefs}>
      <div
        data-testid="shell"
        data-board={prefs.boardTheme}
        data-theme={prefs.siteTheme}
        className="grid min-h-screen grid-cols-[var(--rail-width)_minmax(0,1fr)]"
      >
        <aside className="flex flex-col gap-7 border-r border-line-divider bg-surface-rail px-4 py-6">
          <Wordmark />
          <NavGroup label="Play">
            <NavItem to="/" label="Home" icon={<House size={16} />} />
          </NavGroup>
          <NavGroup label="Games">
            <NavItem to="/games" label="History" icon={<History size={16} />} />
            <NavItem to="/studies" label="Studies" icon={<BookOpen size={16} />} />
          </NavGroup>
          <NavGroup label="You">
            <NavItem to="/settings" label="Settings" icon={<Settings size={16} />} />
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
              <a
                href={LOGOUT_HREF}
                className="text-xs text-fg-muted no-underline hover:text-fg-body"
              >
                Log out
              </a>
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-10 py-8">
          <div className="mx-auto max-w-(--content-max)">{children}</div>
        </main>
      </div>
    </PreferencesContext>
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
  /** A Lucide icon (site-themes), decorative: the label names the link. */
  icon?: ReactNode
}

/** A router link; the router marks the current one (`data-status="active"`), styled as selected. */
function NavItem({ to, label, icon }: NavItemProps) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex w-full items-center gap-2 rounded-control p-2 text-base text-fg-body no-underline transition-colors duration-[120ms] hover:bg-surface-hover hover:text-fg-body data-[status=active]:bg-surface-selected data-[status=active]:text-fg-primary"
    >
      {icon ? (
        <span aria-hidden className="text-fg-muted">
          {icon}
        </span>
      ) : null}
      {label}
    </Link>
  )
}
