import { describe, expect, it } from 'vitest'
import { serverFnName } from './telemetry-web'

describe('browser span names', () => {
  it('name a server function call after the function', () => {
    const encoded = btoa(
      JSON.stringify({
        file: '/src/lib/server/api.ts',
        export: 'postGameCommand_createServerFn_handler',
      }),
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')

    expect(serverFnName(`http://app.chess.localhost/_serverFn/${encoded}?createServerFn`)).toBe(
      'postGameCommand',
    )
  })

  it('leave anything else alone', () => {
    expect(serverFnName('http://app.chess.localhost/games/abc')).toBeNull()
    expect(serverFnName('http://app.chess.localhost/_serverFn/not-base64!')).toBeNull()
  })
})
