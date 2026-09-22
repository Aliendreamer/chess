/** Same-origin auth entry points. No API host anywhere in the client. */
export const LOGIN_HREF = '/api/auth/login'
export const LOGOUT_HREF = '/api/auth/logout'

export function loginHref(returnTo: string): string {
  return `${LOGIN_HREF}?returnTo=${encodeURIComponent(returnTo)}`
}

/** Programmatic variants for code paths that cannot render a link (e.g. after a client-side failure). */
export function login(returnTo: string = window.location.pathname + window.location.search): void {
  window.location.assign(loginHref(returnTo))
}

export function logout(): void {
  window.location.assign(LOGOUT_HREF)
}
