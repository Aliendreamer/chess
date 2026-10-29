import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Crosshair,
  Expand,
  GraduationCap,
  Library,
  Maximize,
  Microscope,
  Minus,
  Newspaper,
  Scaling,
  Settings,
  Shrink,
  Swords,
  X,
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

const RAIL_BUTTON =
  'flex cursor-pointer items-center rounded-control border-0 bg-transparent py-2 text-left text-fg-secondary hover:bg-surface-hover hover:text-fg-primary'

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
  onFullscreen,
  onResize,
  windowButtons,
  children,
}: {
  prefs?: Preferences
  /** Where a link to another site goes: the system browser, never this window (desktop-app D7). */
  onExternalLink?: (url: string) => void
  /** Switches the window to full screen and back (also F11); some title bars (WSLg) offer no maximize. */
  onFullscreen?: () => void
  /** The window 10% smaller or larger, or back to filling the screen. */
  onResize?: (change: 'shrink' | 'grow' | 'fit') => void
  /** Minimize and close, when the window has no system title bar (Linux): the rail's top is then the title bar. */
  windowButtons?: { onMinimize: () => void; onClose: () => void }
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
          className="grid h-screen grid-cols-[var(--rail-width)_minmax(0,1fr)] overflow-hidden bg-surface-page text-fg-primary"
        >
          {/* The window's height exactly: the rail never scrolls away with a long page (its window buttons stay in
              view), and only the page scrolls. */}
          <aside className="flex min-h-0 flex-col gap-7 overflow-y-auto border-r border-line-divider bg-surface-rail px-4 py-6">
            {/* The window is dragged by the rail's top (a double click maximizes it), the title bar's job. */}
            <div data-tauri-drag-region className="flex items-center gap-1">
              <p
                data-tauri-drag-region
                className="m-0 flex-1 cursor-default font-display text-display-sm text-fg-primary select-none"
              >
                Chess
              </p>
              {windowButtons ? (
                <>
                  <button
                    type="button"
                    onClick={windowButtons.onMinimize}
                    aria-label="Minimize"
                    title="Minimize"
                    className={`${RAIL_BUTTON} justify-center px-2`}
                  >
                    <Minus aria-hidden size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={windowButtons.onClose}
                    aria-label="Close"
                    title="Close"
                    className={`${RAIL_BUTTON} justify-center px-2 hover:text-status-loss`}
                  >
                    <X aria-hidden size={16} />
                  </button>
                </>
              ) : null}
            </div>
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
            {onFullscreen || onResize ? (
              <div className="mt-auto flex flex-col gap-1" role="group" aria-label="Window">
                {onFullscreen ? (
                  <button
                    type="button"
                    onClick={onFullscreen}
                    title="Full screen (F11)"
                    aria-keyshortcuts="F11"
                    className={`${RAIL_BUTTON} gap-3 px-3`}
                  >
                    <Maximize aria-hidden size={16} />
                    Full screen
                  </button>
                ) : null}
                {onResize ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onResize('shrink')}
                      aria-label="Smaller window"
                      title="Smaller window"
                      className={`${RAIL_BUTTON} justify-center px-3`}
                    >
                      <Shrink aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onResize('grow')}
                      aria-label="Larger window"
                      title="Larger window"
                      className={`${RAIL_BUTTON} justify-center px-3`}
                    >
                      <Expand aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onResize('fit')}
                      title="Fill the screen, as at the start"
                      className={`${RAIL_BUTTON} flex-1 gap-2 px-3`}
                    >
                      <Scaling aria-hidden size={16} />
                      Fit screen
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </aside>
          <main className="min-h-0 min-w-0 overflow-y-auto px-10 py-8">
            <div className="mx-auto max-w-(--content-max) has-[[data-layout~=fill]]:h-full has-[[data-layout~=wide]]:max-w-(--content-wide)">
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
