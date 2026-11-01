/**
 * Links between screens (mobile-app D5). Screens write the desktop's paths (`/trainer/<family>?color=white`), as the
 * shared components do, and the phone's routes are the same paths under their tab; this maps one to the other, so a
 * path is spelt one way in the whole repo.
 */
const TABS: Array<[RegExp, string]> = [
  [/^\/$/, '/play'],
  [/^\/games(\/|$)/, '/play'],
  [/^\/analysis$/, '/analyse'],
  [/^\/library$/, '/analyse'],
  [/^\/(studies|trainer|training)(\/|$)/, '/learn'],
  [/^\/news$/, ''],
  [/^\/(settings|about)$/, '/more'],
]

/** The phone's route for a desktop path (with its query); throws for a path no screen has. */
export function mobileRoute(to: string): string {
  const cut = to.indexOf('?')
  const path = cut < 0 ? to : to.slice(0, cut)
  const query = cut < 0 ? '' : to.slice(cut)
  for (const [pattern, tab] of TABS) {
    if (!pattern.test(path)) continue
    if (path === '/') return tab + query
    if (path === '/analysis') return tab + query
    return tab + path + query
  }
  throw new Error(`No screen on the phone for ${path}`)
}

/**
 * A path with its query, as `@chess/ui`'s `href`: `appHref('/trainer', { color: 'white' })` → `/trainer?color=white`;
 * empty values are left out. Built by hand, since React Native's URLSearchParams is incomplete.
 */
export function appHref(
  path: string,
  search: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts = Object.entries(search)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  return parts.length ? `${path}?${parts.join('&')}` : path
}
