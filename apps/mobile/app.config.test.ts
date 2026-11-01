import appConfig, { versionCode } from './app.config'
import pkg from './package.json'

test('Android’s versionCode follows the version, so each release installs over the last', () => {
  expect(versionCode('1.2.3')).toBe(10203)
  expect(versionCode('1.0.0')).toBe(10000)
  expect(versionCode('0.0.0')).toBe(1)
  expect(versionCode('2.10.0')).toBeGreaterThan(versionCode('1.99.99'))
  expect(() => versionCode('1.100.0')).toThrow()
  expect(() => versionCode('1.0.0-rc.1')).toThrow()
})

test('the app takes its version from package.json, which Nx Release writes', () => {
  const config = appConfig({ config: {} } as never)
  expect(config.version).toBe(pkg.version)
  expect(config.android?.versionCode).toBe(versionCode(pkg.version))
  expect(config.android?.package).toBe('io.github.aliendreamer.chess')
  expect(config.ios?.bundleIdentifier).toBe('io.github.aliendreamer.chess')
})

test('Android builds 64-bit only: Stockfish 19 needs __int128, which 32-bit ABIs lack', () => {
  const config = appConfig({ config: {} } as never)
  const buildProperties = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  ) as [string, { android: { buildArchs: Array<string> } }]
  expect(buildProperties[1].android.buildArchs).toEqual(['arm64-v8a', 'x86_64'])
})

test('the release APK is signed by the release-signing plugin', () => {
  expect(appConfig({ config: {} } as never).plugins).toContain('./plugins/with-release-signing')
})
