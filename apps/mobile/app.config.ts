import type { ConfigContext, ExpoConfig } from 'expo/config'
import pkg from './package.json'

/**
 * The app's identity and native set-up (mobile-app D4, D11). The version is `package.json`'s, which Nx Release writes,
 * so the app, the tag `mobile@{version}` and the changelog agree; Android's `versionCode` follows from it.
 */

/** The Club's page colour (`--color-ink-900`, oklch(0.17 0.008 70)), behind the splash and the Android icon. */
const CLUB_PAGE = '#120F0C'

/** major·10000 + minor·100 + patch, so every release installs over the one before; at least 1 (0.0.0 in development). */
export function versionCode(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Not a release version: ${version}`)
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number]
  if (minor > 99 || patch > 99) throw new Error(`Minor and patch must stay under 100: ${version}`)
  return Math.max(1, major * 10_000 + minor * 100 + patch)
}

const font = (family: string, file: string) => `./node_modules/@expo-google-fonts/${family}/${file}`

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: 'Chess',
    slug: 'chess-mobile',
    version: pkg.version,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'chess',
    // Club dark or Parchment light, as the player sets it (the system's by default).
    userInterfaceStyle: 'automatic',
    android: {
      package: 'io.github.aliendreamer.chess',
      versionCode: versionCode(pkg.version),
      adaptiveIcon: { foregroundImage: './assets/images/icon.png', backgroundColor: CLUB_PAGE },
    },
    ios: { bundleIdentifier: 'io.github.aliendreamer.chess', supportsTablet: false },
    platforms: ['android', 'ios'],
    plugins: [
      'expo-router',
      'expo-dev-client',
      'expo-sqlite',
      [
        'expo-splash-screen',
        { backgroundColor: CLUB_PAGE, image: './assets/images/icon.png', imageWidth: 160 },
      ],
      // The Club's fonts, embedded at build time: no font is fetched while the app runs.
      [
        'expo-font',
        {
          fonts: [
            font('ibm-plex-sans', '400Regular/IBMPlexSans_400Regular.ttf'),
            font('ibm-plex-sans', '500Medium/IBMPlexSans_500Medium.ttf'),
            font('ibm-plex-sans', '600SemiBold/IBMPlexSans_600SemiBold.ttf'),
            font('ibm-plex-mono', '400Regular/IBMPlexMono_400Regular.ttf'),
            font('ibm-plex-mono', '500Medium/IBMPlexMono_500Medium.ttf'),
            font('newsreader', '400Regular/Newsreader_400Regular.ttf'),
            font('newsreader', '500Medium/Newsreader_500Medium.ttf'),
            font('newsreader', '400Regular_Italic/Newsreader_400Regular_Italic.ttf'),
          ],
        },
      ],
      // 64-bit only: Stockfish 19 uses __int128, which 32-bit ABIs lack; arm64-v8a is phones, x86_64 the emulator.
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            buildArchs: ['arm64-v8a', 'x86_64'],
          },
        },
      ],
    ],
    experiments: { typedRoutes: true },
  }
}
