import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  apiUrl,
  clientIp,
  forwardClientIp,
  keycloakTokenUrl,
  relayClient,
  relayRevalidateMs,
} from './upstream'

describe('clientIp', () => {
  it('takes the rightmost X-Forwarded-For entry: the one our edge appended', () => {
    expect(clientIp('203.0.113.7')).toBe('203.0.113.7')
    expect(clientIp(' 203.0.113.7 ')).toBe('203.0.113.7')
    // What a client wrote sits to the left of what the edge saw.
    expect(clientIp('1.2.3.4, 6.6.6.6,203.0.113.7')).toBe('203.0.113.7')
    expect(clientIp('2001:db8::1')).toBe('2001:db8::1')
  })

  it('falls back to the socket address, and knows none without either', () => {
    expect(clientIp(null, '172.30.0.9')).toBe('172.30.0.9')
    expect(clientIp('', '::ffff:172.30.0.9')).toBe('::ffff:172.30.0.9')
    expect(clientIp(' , ', undefined)).toBeNull()
    expect(clientIp(undefined)).toBeNull()
  })

  it('refuses anything that is not an address, so no header text reaches the API', () => {
    expect(clientIp('evil\r\nx-injected: 1')).toBeNull()
    expect(clientIp('unknown', '10.0.0.1')).toBe('10.0.0.1')
  })

  it('sets X-Forwarded-For only for a known address', () => {
    const headers = new Headers({ 'x-forwarded-for': 'stale' })
    forwardClientIp(headers, '203.0.113.7')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
    const none = new Headers()
    forwardClientIp(none, null)
    expect(none.has('x-forwarded-for')).toBe(false)
  })
})

describe('server config', () => {
  it('reads the relay settings', () => {
    const env = {
      KEYCLOAK_TOKEN_URL: 'http://kc/token',
      RELAY_CLIENT_ID: 'chess_bff',
      RELAY_CLIENT_SECRET: 's',
      RELAY_REVALIDATE_MS: '1000',
    }
    expect(keycloakTokenUrl(env)).toBe('http://kc/token')
    expect(relayClient(env)).toEqual({ id: 'chess_bff', secret: 's' })
    expect(relayRevalidateMs(env)).toBe(1000)
  })

  it('names the missing variable', () => {
    expect(() => keycloakTokenUrl({})).toThrow(/KEYCLOAK_TOKEN_URL/)
    expect(() => relayClient({ RELAY_CLIENT_ID: 'x' })).toThrow(/RELAY_CLIENT_SECRET/)
    expect(() => apiUrl({})).toThrow(/API_URL/)
  })

  it('defaults re-validation to 5 minutes and rejects nonsense', () => {
    expect(relayRevalidateMs({})).toBe(300_000)
    expect(() => relayRevalidateMs({ RELAY_REVALIDATE_MS: 'soon' })).toThrow(/RELAY_REVALIDATE_MS/)
  })
})

/**
 * The client-bundle guard: server-only configuration may be read only under `lib/server/` (and the Nitro
 * `server/` tree, outside `src/`). Anything else under `src/` can end up in the browser bundle.
 */
describe('client bundle guard', () => {
  const SERVER_ONLY = [
    'API_URL',
    'KEYCLOAK_TOKEN_URL',
    'RELAY_CLIENT_ID',
    'RELAY_CLIENT_SECRET',
    'RELAY_REVALIDATE_MS',
  ]
  const src = join(__dirname, '..', '..')

  function files(dir: string): Array<string> {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return files(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
    })
  }

  it('keeps server-only env names out of browser-reachable source', () => {
    const offenders = files(src)
      .filter((f) => !relative(src, f).startsWith(join('lib', 'server')))
      .filter((f) => !f.endsWith('env.d.ts'))
      .flatMap((f) => {
        const text = readFileSync(f, 'utf8')
        return SERVER_ONLY.filter((name) => text.includes(name)).map(
          (name) => `${relative(src, f)}: ${name}`,
        )
      })

    expect(offenders).toEqual([])
  })
})
