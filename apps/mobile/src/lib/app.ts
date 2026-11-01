import '@/platform/polyfills'
import { AppState } from 'react-native'
import { expoAssets } from '@/platform/assets'
import { nativeChannel, takeCrashFiles } from '@/platform/engine'
import { fetchText, openLink } from '@/platform/net'
import { openExpoSql } from '@/platform/sql'
import { startServices } from './services'
import type { MobileServices } from './services'

/** The real services: the phone's SQLite, Stockfish in the app, the shipped files, the network (mobile-app D9). */
export async function startMobileServices(): Promise<MobileServices> {
  const { defaultDatabaseDirectory } = await import('expo-sqlite')
  // `VACUUM INTO` takes a plain path; the directory may come as a file:// URI.
  const dir = String(defaultDatabaseDirectory).replace(/^file:\/\//, '')
  return startServices({
    sql: await openExpoSql('chess.db'),
    backupPath: (v) => `${dir}/chess.db.before-v${v}`,
    channel: () => nativeChannel(),
    assets: expoAssets(),
    fetchText,
    openLink,
    appState: AppState,
    crashFiles: () => takeCrashFiles(),
  })
}
