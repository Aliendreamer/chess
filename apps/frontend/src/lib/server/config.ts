/** Server-side only. Never import from client components. */
export function apiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.API_URL
  if (!url) throw new Error('API_URL is not set (server-side env, e.g. http://chess-backend:8080)')
  return url.replace(/\/+$/, '')
}
