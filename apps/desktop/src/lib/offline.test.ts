import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BROADCAST_URL, FEEDS } from '#/lib/data/news'

/**
 * Offline by construction (desktop-app: "MUST NOT contact any host except the news sources"): the capability's HTTP
 * allow-list names only the news sources, and the window's CSP lets nothing load from another origin.
 */
// vitest runs from the app's root (jsdom has no file: import.meta.url).
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const capability = JSON.parse(read('src-tauri/capabilities/default.json')) as {
  permissions: Array<
    string | { identifier: string; allow?: Array<{ url?: string; name?: string }> }
  >
}
const config = JSON.parse(read('src-tauri/tauri.conf.json')) as {
  app: { security: { csp: string } }
}

describe('what the app may reach', () => {
  it('fetches over HTTP only from the news sources', () => {
    const http = capability.permissions.filter(
      (p) => typeof p !== 'string' && p.identifier.startsWith('http:'),
    )
    const allowed = http.flatMap((p) =>
      typeof p === 'string' ? [] : (p.allow ?? []).map((a) => a.url ?? ''),
    )
    const hosts = new Set([...FEEDS.map((f) => f.url), BROADCAST_URL].map((u) => new URL(u).host))
    expect(allowed.length).toBeGreaterThan(0)
    for (const url of allowed) expect(hosts.has(new URL(url.replace('*', '')).host)).toBe(true)
    expect(capability.permissions).not.toContain('http:default')
  })

  it('spawns only the bundled Stockfish', () => {
    const spawn = capability.permissions.find(
      (p) => typeof p !== 'string' && p.identifier === 'shell:allow-spawn',
    )
    expect(typeof spawn !== 'string' && spawn?.allow).toEqual([
      { name: 'binaries/stockfish', sidecar: true },
    ])
    expect(capability.permissions).not.toContain('shell:allow-execute')
  })

  it('loads nothing from another origin into the window', () => {
    const csp = config.app.security.csp
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toMatch(/https?:\/\/(?!ipc\.localhost)/)
    expect(read('index.html')).not.toMatch(/https?:\/\//)
  })

  it('fetches the bundled library from its own files', () => {
    const connect = config.app.security.csp
      .split(';')
      .find((d) => d.trim().startsWith('connect-src'))
    expect(connect?.trim().split(/\s+/)).toContain("'self'")
  })
})
