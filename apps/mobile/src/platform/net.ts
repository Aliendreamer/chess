import type { FetchText } from '@chess/local'

const TIMEOUT_MS = 10_000

/**
 * The news fetch for `@chess/local` (desktop-app D7, mobile-app): a plain GET with React Native's fetch (no browser,
 * so no CORS), https only, given up after 10 s; a failed round leaves the kept items.
 */
export const fetchText: FetchText = async (url, headers) => {
  if (!url.startsWith('https://')) throw new Error(`Only https is fetched: ${url}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const answer = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    return { status: answer.status, text: await answer.text() }
  } finally {
    clearTimeout(timer)
  }
}

/** A link opens in the phone's browser, never inside the app. */
export async function openLink(url: string): Promise<void> {
  const { openURL } = await import('expo-linking')
  await openURL(url)
}
