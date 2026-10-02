import { Link } from '@tanstack/react-router'
import { BookOpen, History, House, Menu, Settings, Tv, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Me, Preferences } from '#/lib/auth'
import type { LinkProps } from '@tanstack/react-router'
import { DEFAULT_PREFERENCES, LOGOUT_HREF, PreferencesContext } from '#/lib/auth'

/**
 * The Club layout: a 248px rail (wordmark, navigation, who you are) and the content column; a top bar on narrow screens. The user's preferences
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
        // Its own ground: the site theme is set here, below <body>. From 900px the rail sits beside the content;
        // narrower, a top bar with a menu takes its place (responsive-layout).
        className="min-h-screen bg-surface-page text-fg-primary shell:grid shell:grid-cols-[var(--rail-width)_minmax(0,1fr)]"
      >
        <TopBar me={me} />
        <aside className="hidden flex-col gap-7 border-r border-line-divider bg-surface-rail px-4 py-6 shell:flex">
          <Wordmark />
          <Navigation me={me} />
          <div className="mt-auto">
            <Account me={me} testId="identity-name" />
          </div>
        </aside>
        <main className="min-w-0 px-4 py-5 shell:px-10 shell:py-8">
          <div className="mx-auto max-w-(--content-max)">{children}</div>
        </main>
      </div>
    </PreferencesContext>
  )
}

/**
 * Below 900px: the wordmark and a menu. A `<details>` element, so it opens before hydration and without JS (like the
 * plain logout link); a link inside it closes it again.
 */
function TopBar({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line-divider bg-surface-rail px-4 py-2.5 shell:hidden">
      <Wordmark />
      <details className="relative">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-3 text-sm text-fg-body hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
          <Menu aria-hidden size={18} />
          Menu
        </summary>
        <div
          className="absolute right-0 mt-2 flex w-60 flex-col gap-5 rounded-card border border-line-default bg-surface-rail p-3 shadow-2xl"
          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
        >
          <Navigation me={me} />
          <Account me={me} />
        </div>
      </details>
    </header>
  )
}

function Navigation({ me }: { me: Me }) {
  return (
    <>
      <NavGroup label="Play">
        <NavItem to="/" label="Home" icon={<House size={16} />} />
        <NavItem to="/watch" label="Watch" icon={<Tv size={16} />} />
      </NavGroup>
      <NavGroup label="Games">
        <NavItem to="/games" label="History" icon={<History size={16} />} />
        <NavItem to="/studies" label="Studies" icon={<BookOpen size={16} />} />
      </NavGroup>
      <NavGroup label="You">
        <NavItem
          to="/players/$id"
          params={{ id: String(me.id) }}
          label="Profile"
          icon={<UserRound size={16} />}
        />
        <NavItem to="/settings" label="Settings" icon={<Settings size={16} />} />
      </NavGroup>
    </>
  )
}

/** Who is signed in, and the way out. */
function Account({ me, testId }: { me: Me; testId?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-board-dark font-semibold text-fg-primary"
      >
        {me.username.charAt(0).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium" data-testid={testId}>
          {me.username}
        </span>
        {/* A plain link, not an onClick: logout is a GET on the same-origin proxy and must work before
            hydration (SSR-first) and without JS at all. */}
        <a href={LOGOUT_HREF} className="text-xs text-fg-muted no-underline hover:text-fg-body">
          Log out
        </a>
      </div>
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
  params?: LinkProps['params']
  label: string
  /** A Lucide icon (site-themes), decorative: the label names the link. */
  icon?: ReactNode
}

/** A router link; the router marks the current one (`data-status="active"`), styled as selected. */
function NavItem({ to, params, label, icon }: NavItemProps) {
  return (
    <Link
      to={to}
      {...(params ? { params } : {})}
      activeOptions={{ exact: true }}
      className="flex min-h-9 w-full items-center gap-2 rounded-control p-2 text-base pointer-coarse:min-h-11 text-fg-body no-underline transition-colors duration-[120ms] hover:bg-surface-hover hover:text-fg-body data-[status=active]:bg-surface-selected data-[status=active]:text-fg-primary"
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
