import { getRandomValues } from 'expo-crypto'

type Fill = (array: Uint8Array) => Uint8Array

/**
 * What the shared code expects of the platform and Hermes lacks: `crypto.getRandomValues` (`@chess/local`'s `newId`,
 * UUID v7). Hermes has TextEncoder; the bundled library is unzipped with fflate. Kept when the runtime has its own.
 */
export function installCrypto(target: { crypto?: { getRandomValues: Fill } }, fill: Fill): void {
  if (target.crypto?.getRandomValues) return
  target.crypto = { ...(target.crypto ?? {}), getRandomValues: fill }
}

installCrypto(globalThis as never, (array) => getRandomValues(array))
