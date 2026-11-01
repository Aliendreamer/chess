import { expoSql } from '@/platform/sql'
import type { Platform } from '@/lib/services'
import type { UciChannel } from '@chess/local'
import { nodeDatabase } from './node-sql'

/**
 * The phone's platform for tests: Node's SQLite under the expo-sqlite adapter, an engine that never answers, the
 * shipped files as small stand-ins, a network that serves empty feeds, and an app state the test moves.
 */
export function testPlatform(overrides: Partial<Platform> = {}) {
  const native = nodeDatabase()
  const appListeners: Array<(state: string) => void> = []
  const fetched: Array<string> = []
  const channel: UciChannel = {
    write: () => Promise.resolve(),
    onLine: () => {},
    onExit: () => {},
    kill: () => Promise.resolve(),
  }
  const p: Platform = {
    sql: expoSql(native),
    backupPath: (v) => `/data/chess.db.before-v${v}`,
    channel: () => Promise.resolve(channel),
    assets: {
      openings: () => Promise.resolve(["eco\tname\tpgn\nB00\tKing's Pawn\t1. e4"]),
      bundledLibrary: () =>
        Promise.resolve(
          new TextEncoder().encode('{"format":1,"games":[],"candidates":[],"positions":[]}'),
        ),
    },
    fetchText: (url) => {
      fetched.push(url)
      return Promise.resolve({ status: 200, text: '<rss version="2.0"><channel></channel></rss>' })
    },
    openLink: () => Promise.resolve(),
    appState: {
      addEventListener: (_type, listener) => {
        appListeners.push(listener)
        return { remove: () => undefined }
      },
    },
    crashFiles: () => ({ crash: null, marker: null }),
    ...overrides,
  }
  return { p, native, fetched, goTo: (state: string) => appListeners.forEach((l) => l(state)) }
}
