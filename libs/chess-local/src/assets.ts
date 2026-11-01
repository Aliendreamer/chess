/**
 * What ships inside an app and the local data layer reads (mobile-app D1). Each app loads it its own way: the desktop
 * with Vite's asset imports, the mobile app with `expo-asset`; the tests read the repository's files.
 */
export interface LocalAssets {
  /** The openings list: the backend's TSV files, in file-name order. */
  openings: () => Promise<Array<string>>
  /** The bundled library (`apps/desktop/library/library.json.gz`), as its bytes, gzipped or not. */
  bundledLibrary: () => Promise<Uint8Array>
}
