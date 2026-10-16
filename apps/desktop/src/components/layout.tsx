import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Crosshair,
  GraduationCap,
  Library,
  Microscope,
  Newspaper,
  Settings,
  Swords,
} from 'lucide-react'
import { DEFAULT_PREFERENCES } from '@chess/core'
import { LinkContext, PreferencesContext, SectionHeading } from '@chess/ui'
import type { ReactNode } from 'react'
import type { Preferences } from '@chess/core'
import type { AppLinkProps } from '@chess/ui'
import type { LinkProps } from '@tanstack/react-router'

/** Shared components' links: a path with an optional query, on this app's router (shared-chess-libraries). */
export function DesktopLink({ to, ...rest }: AppLinkProps) {
  const [path = '', query] = to.split('?')
  const props = {
    ...rest,
    to: path,
    ...(query ? { search: searchOf(query) } : {}),
  } as unknown as LinkProps
  return <Link {...props} />
}

/** A query as the router reads one: each value JSON when it parses (`ply=12` is a number), else the text. */
function searchOf(query: string): Record<string, unknown> {
  return Object.fromEntries(
    [...new URLSearchParams(query)].map(([key, value]) => {
      try {
        return [key, JSON.parse(value) as unknown]
      } catch {
        return [key, value]
      }
    }),
  )
}

const NAV: ReadonlyArray<{ to: string; label: string; icon: typeof Swords; exact?: boolean }> = [
  { to: '/', label: 'Play', icon: Swords, exact: true },
  { to: '/analysis', label: 'Analysis', icon: Microscope },
  { to: '/studies', label: 'Studies', icon: BookOpen },
  { to: '/trainer', label: 'Trainer', icon: GraduationCap },
  { to: '/training', label: 'Training', icon: Crosshair },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/**
 * The desktop app's shell (desktop-app D2): the club's rail without the club's items — no members, admin, profiles or
 * sign-out, one local player. The root carries the board and site themes from the settings.
 */
export function Shell({
  prefs = DEFAULT_PREFERENCES,
  onExternalLink,
  children,
}: {
  prefs?: Preferences
  /** Where a link to another site goes: the system browser, never this window (desktop-app D7). */
  onExternalLink?: (url: string) => void
  children: ReactNode
}) {
  return (
    <LinkContext value={DesktopLink}>
      <PreferencesContext value={prefs}>
        <div
          data-testid="shell"
          data-board={prefs.boardTheme}
          data-theme={prefs.siteTheme}
          onClickCapture={(event) => {
            const link = (event.target as HTMLElement).closest('a[href]')
            const url = link?.getAttribute('href') ?? ''
            if (!/^https?:\/\//i.test(url)) return
            event.preventDefault()
            onExternalLink?.(url)
          }}
          className="grid min-h-screen grid-cols-[var(--rail-width)_minmax(0,1fr)] bg-surface-page text-fg-primary"
        >
          <aside className="flex flex-col gap-7 border-r border-line-divider bg-surface-rail px-4 py-6">
            <p className="m-0 font-display text-display-sm text-fg-primary">Chess</p>
            <nav aria-label="Main" className="flex flex-col gap-1">
              {NAV.map(({ to, label, icon: Icon, exact }) => (
                <Link
                  key={to}
                  to={to as never}
                  activeOptions={{ exact: exact ?? false }}
                  className="flex items-center gap-3 rounded-control px-3 py-2 text-fg-secondary no-underline hover:bg-surface-hover hover:text-fg-primary data-[status=active]:bg-surface-current data-[status=active]:text-fg-primary"
                >
                  <Icon aria-hidden size={16} />
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="min-w-0 px-10 py-8">
            <div className="mx-auto max-w-(--content-max) has-[[data-layout~=wide]]:max-w-(--content-wide)">
              {children}
            </div>
          </main>
        </div>
      </PreferencesContext>
    </LinkContext>
  )
}

/** An address the app has no page for. */
export function NotFound() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading size="xl">Not here</SectionHeading>
      <p className="text-fg-secondary">
        This page does not exist.{' '}
        <Link to="/" className="text-fg-accent">
          Back to play
        </Link>
      </p>
    </section>
  )
}
