import type { LocalAssets } from '@chess/local'

/**
 * What ships inside the app for `@chess/local` (mobile-app D1, D9): the openings list (the backend's TSV files, as
 * the desktop bundles them) and the club's library (`apps/desktop/library/library.json.gz`, design D12 of desktop-app),
 * as Metro assets read with expo-asset and expo-file-system.
 */
export const SHIPPED = {
  openings: [
    require('../../../backend/Library/Openings/a.tsv'),
    require('../../../backend/Library/Openings/b.tsv'),
    require('../../../backend/Library/Openings/c.tsv'),
    require('../../../backend/Library/Openings/d.tsv'),
    require('../../../backend/Library/Openings/e.tsv'),
  ] as Array<number>,
  library: require('../../../desktop/library/library.json.gz') as number,
}

/** Reads a Metro asset; tests pass a stand-in. */
export interface AssetReader {
  text: (module: number) => Promise<string>
  bytes: (module: number) => Promise<Uint8Array>
}

/** The real reader: the asset copied to the device's cache by expo-asset, then read as a file. */
export function expoReader(): AssetReader {
  const file = async (module: number) => {
    const [{ Asset }, { File }] = await Promise.all([
      import('expo-asset'),
      import('expo-file-system'),
    ])
    const asset = await Asset.fromModule(module).downloadAsync()
    if (!asset.localUri) throw new Error(`The shipped file ${asset.name} could not be opened.`)
    return new File(asset.localUri)
  }
  return {
    text: async (module) => (await file(module)).text(),
    bytes: async (module) => (await file(module)).bytes(),
  }
}

export function expoAssets(
  reader: AssetReader = expoReader(),
  modules: { openings: Array<number>; library: number } = SHIPPED,
): LocalAssets {
  return {
    openings: () => Promise.all(modules.openings.map((m) => reader.text(m))),
    bundledLibrary: () => reader.bytes(modules.library),
  }
}
