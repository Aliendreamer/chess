/** Who is signed in, their display preferences, and the same-origin auth entry points. No API host in the client. */
export const LOGIN_HREF = '/api/auth/login'
export const LOGOUT_HREF = '/api/auth/logout'

export function loginHref(returnTo: string): string {
  return `${LOGIN_HREF}?returnTo=${encodeURIComponent(returnTo)}`
}

/** Mirrors the API's `GET api/me` response. */
export interface Me {
  id: number
  subject: string
  email?: string | null
  roles: Array<string>
  /** The display name (D23): Keycloak `preferred_username`, else `Player {id}`. */
  username: string
}
