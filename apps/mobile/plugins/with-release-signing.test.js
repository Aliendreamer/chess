const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { addReleaseSigning, signingFromEnv } = require('./with-release-signing')

// Excerpt of android/app/build.gradle as `expo prebuild` writes it on SDK 57.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`

function keystore() {
  const path = join(mkdtempSync(join(tmpdir(), 'chess-keystore-')), 'chess.jks')
  writeFileSync(path, 'not really a keystore')
  return path
}

describe('the release signing (mobile-app D11, task 6.2)', () => {
  test('a release build without the keystore says which variable is missing', () => {
    expect(() => signingFromEnv({ CHESS_BUILD_PROFILE: 'release' })).toThrow(
      /CHESS_ANDROID_KEYSTORE\b/,
    )
  })

  test('names each missing variable in turn, and a keystore path that is not there', () => {
    const path = keystore()
    expect(() =>
      signingFromEnv({ CHESS_BUILD_PROFILE: 'release', CHESS_ANDROID_KEYSTORE: path }),
    ).toThrow(/CHESS_ANDROID_KEYSTORE_PASSWORD/)
    expect(() =>
      signingFromEnv({
        CHESS_BUILD_PROFILE: 'release',
        CHESS_ANDROID_KEYSTORE: path,
        CHESS_ANDROID_KEYSTORE_PASSWORD: 'secret',
      }),
    ).toThrow(/CHESS_ANDROID_KEY_ALIAS/)
    expect(() =>
      signingFromEnv({
        CHESS_BUILD_PROFILE: 'release',
        CHESS_ANDROID_KEYSTORE: '/nowhere/chess.jks',
        CHESS_ANDROID_KEYSTORE_PASSWORD: 'secret',
        CHESS_ANDROID_KEY_ALIAS: 'chess',
      }),
    ).toThrow(/\/nowhere\/chess\.jks/)
  })

  test('a development build needs none of them', () => {
    expect(signingFromEnv({})).toBeNull()
    expect(signingFromEnv({ CHESS_BUILD_PROFILE: 'development' })).toBeNull()
  })

  test('the key password defaults to the keystore password, as keytool makes them', () => {
    const path = keystore()
    expect(
      signingFromEnv({
        CHESS_BUILD_PROFILE: 'release',
        CHESS_ANDROID_KEYSTORE: path,
        CHESS_ANDROID_KEYSTORE_PASSWORD: 'secret',
        CHESS_ANDROID_KEY_ALIAS: 'chess',
      }),
    ).toEqual({
      storeFile: path,
      storePassword: 'secret',
      keyAlias: 'chess',
      keyPassword: 'secret',
    })
  })

  const output = addReleaseSigning(TEMPLATE)

  test('adds a release signing config read from Gradle properties, never written to the file', () => {
    expect(output).toContain(`        release {
            if (project.hasProperty('CHESS_ANDROID_KEYSTORE')) {
                storeFile file(CHESS_ANDROID_KEYSTORE)
                storePassword CHESS_ANDROID_KEYSTORE_PASSWORD
                keyAlias CHESS_ANDROID_KEY_ALIAS
                keyPassword CHESS_ANDROID_KEY_PASSWORD
            }
        }`)
    expect(output).not.toContain('secret')
  })

  test('signs release builds with the owner’s key only when the properties are given; debug stays on its key', () => {
    const buildTypes = output.slice(output.indexOf('    buildTypes {'))
    expect(buildTypes).toContain(
      "signingConfig project.hasProperty('CHESS_ANDROID_KEYSTORE') ? signingConfigs.release : signingConfigs.debug",
    )
    expect(buildTypes.slice(0, buildTypes.indexOf('        release {'))).toContain(
      'signingConfig signingConfigs.debug',
    )
  })

  test('is idempotent, and fails loudly on a template it does not know', () => {
    expect(addReleaseSigning(output)).toBe(output)
    expect(() => addReleaseSigning('android {\n}\n')).toThrow(/template changed/)
  })
})
