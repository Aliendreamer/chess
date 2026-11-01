import { backupTo, restoreFrom } from '@chess/local'
import type { CommandOutcome } from '@chess/core'
import type { Db, Sql } from '@chess/local'

/** The phone's files (mobile-app D9): the cache, the share sheet, the file picker, a database opened by path. */
export interface FilePlatform {
  /** Plain paths (no file://). */
  cacheDir: string
  dataDir: string
  /** A picked file, copied into the cache; null when the player cancels. */
  pick: () => Promise<string | null>
  share: (path: string, mimeType: string) => Promise<void>
  open: (path: string) => Promise<Sql & { close?: () => Promise<void> | void }>
  readText: (path: string) => Promise<string>
  writeText: (path: string, text: string) => Promise<void>
  now: () => Date
}

const BACKUP_TYPE = 'application/octet-stream'
const PGN_TYPE = 'application/x-chess-pgn'

/**
 * Backup and restore (desktop-app D10) and PGN in and out, the phone's way: a file in the cache handed to the share
 * sheet, and a file the player picks. The backup is the desktop's `.chessbackup`, so one restores on the other; the
 * restore keeps the current data aside first and replaces it whole (the screen asks for confirmation before).
 */
export function mobileFiles(db: Db, platform: FilePlatform) {
  const day = () => platform.now().toISOString().slice(0, 10)
  return {
    async backup(): Promise<void> {
      const path = `${platform.cacheDir}/chess-${day()}.chessbackup`
      await backupTo(db, path)
      await platform.share(path, BACKUP_TYPE)
    },
    /** The restore's outcome, or null when the player picked nothing. */
    async restore(): Promise<CommandOutcome<true> | null> {
      const path = await platform.pick()
      if (!path) return null
      return restoreFrom(
        db,
        { path, open: () => platform.open(path) },
        `${platform.dataDir}/chess.db.before-restore-${platform.now().getTime()}`,
      )
    },
    async exportText(name: string, text: string): Promise<void> {
      const path = `${platform.cacheDir}/${name.replace(/[/\\]/g, '-')}`
      await platform.writeText(path, text)
      await platform.share(path, PGN_TYPE)
    },
    /** A picked file's text (a PGN collection), or null when the player picked nothing. */
    async importText(): Promise<string | null> {
      const path = await platform.pick()
      return path ? platform.readText(path) : null
    },
  }
}

const plain = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''))

/** The real platform: expo-file-system's cache and documents, expo-sharing, expo-document-picker, expo-sqlite. */
export async function expoFilePlatform(): Promise<FilePlatform> {
  const [{ File, Paths }, Sharing, Picker, SQLite, { expoSql }] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
    import('expo-document-picker'),
    import('expo-sqlite'),
    import('./sql'),
  ])
  return {
    cacheDir: plain(Paths.cache.uri).replace(/\/$/, ''),
    dataDir: plain(Paths.document.uri).replace(/\/$/, ''),
    pick: async () => {
      const result = await Picker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
      return result.canceled || !result.assets[0] ? null : plain(result.assets[0].uri)
    },
    share: (path, mimeType) => Sharing.shareAsync(`file://${path}`, { mimeType }),
    open: async (path) => {
      const at = path.lastIndexOf('/')
      const other = await SQLite.openDatabaseAsync(path.slice(at + 1), {}, path.slice(0, at))
      return Object.assign(expoSql(other as never), { close: () => other.closeAsync() })
    },
    readText: (path) => new File(`file://${path}`).text(),
    writeText: async (path, text) => {
      const file = new File(`file://${path}`)
      if (!file.exists) file.create()
      file.write(text)
    },
    now: () => new Date(),
  }
}
