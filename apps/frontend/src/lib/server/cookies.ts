/**
 * Cookie re-homing between the API and the app origin. Pure functions, unit-tested.
 *
 * Outbound (API → browser): strip the API's `Domain`, force `Path=/`, `HttpOnly`, `SameSite=Lax`,
 * keep the lifetime, and in prod add the `__Host-` prefix + `Secure`.
 * Inbound (browser → API): forward only the auth cookies, mapped back to their bare API names.
 */

/** Cookies the API owns; nothing else ever crosses the BFF boundary. */
export const AUTH_COOKIES = ['mp_sid', 'mp_pkce'] as const
export type AuthCookie = (typeof AUTH_COOKIES)[number]

const HOST_PREFIX = '__Host-'

/** `__Host-`/`Secure` are gated on COOKIE_SECURE, never NODE_ENV: a prod build over plain HTTP must still log in. */
export function cookiesAreSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COOKIE_SECURE === 'true'
}

export function appCookieName(apiName: string, secure: boolean): string {
  return secure ? `${HOST_PREFIX}${apiName}` : apiName
}

function isAuthCookie(name: string): name is AuthCookie {
  return (AUTH_COOKIES as ReadonlyArray<string>).includes(name)
}

/** Rewrite one upstream `Set-Cookie` header into an app-scoped cookie. Unknown cookies are dropped. */
export function rehomeSetCookie(setCookie: string, secure: boolean): string | null {
  const [pair, ...attrs] = setCookie.split(';').map((s) => s.trim())
  if (!pair) return null
  const eq = pair.indexOf('=')
  if (eq <= 0) return null
  const name = pair.slice(0, eq)
  const value = pair.slice(eq + 1)
  if (!isAuthCookie(name)) return null

  const kept: Array<string> = []
  for (const attr of attrs) {
    const key = attr.split('=')[0]?.toLowerCase()
    // Lifetime survives; scope attributes are re-issued below.
    if (key === 'max-age' || key === 'expires') kept.push(attr)
  }

  const out = [
    `${appCookieName(name, secure)}=${value}`,
    ...kept,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) out.push('Secure')
  return out.join('; ')
}

/** Build the `Cookie` header for the API from the browser's `Cookie` header: auth cookies only, API names. */
export function forwardCookieHeader(
  cookieHeader: string | null | undefined,
  secure: boolean,
): string | null {
  if (!cookieHeader) return null
  const forwarded: Array<string> = []
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    let name = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (secure && name.startsWith(HOST_PREFIX)) name = name.slice(HOST_PREFIX.length)
    if (isAuthCookie(name)) forwarded.push(`${name}=${value}`)
  }
  return forwarded.length > 0 ? forwarded.join('; ') : null
}
