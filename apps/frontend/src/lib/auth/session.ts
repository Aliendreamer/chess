/** Same-origin navigation into the auth proxy. No API host anywhere in the client. */
export function login(returnTo: string = window.location.pathname + window.location.search): void {
  window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
}

export function logout(): void {
  window.location.assign('/api/auth/logout')
}
