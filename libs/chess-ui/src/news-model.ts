/**
 * Chess news and the tournaments being played now (chess-news): the API's shapes and how they read. Client-safe; the
 * reads are in `lib/server/news.ts`.
 */

export interface NewsItem {
  id: string
  source: string
  sourceName: string
  title: string
  url: string
  publishedAt: string
}

export interface NewsSource {
  id: string
  name: string
}

export interface ChessEvent {
  id: string
  name: string
  url: string
  roundName: string | null
  roundUrl: string | null
  ongoing: boolean
  location: string | null
  fideTc: string | null
  startsAt: string | null
  endsAt: string | null
}

/** "just now", "45 min ago", "5 h ago", "2 days ago". */
export function ageText(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

/** The site a link leads to, for "opens en.chessbase.com". */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const TIME_CONTROLS: Record<string, string> = {
  standard: 'Classical',
  rapid: 'Rapid',
  blitz: 'Blitz',
}

/** lichess's `fideTC` in the club's words. */
export function timeControlLabel(fideTc: string | null): string {
  return fideTc ? (TIME_CONTROLS[fideTc] ?? fideTc) : ''
}
