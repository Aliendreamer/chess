import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiUrl, keycloakTokenUrl, relayClient, relayRevalidateMs } from './config'

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
