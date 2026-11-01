// Config plugin (mobile-app D11): sign the release APK with the owner's keystore, from SpanishGameApp's.
// `expo prebuild` regenerates android/, so the signing config is written again on every prebuild. The values never
// reach a file or the process list: scripts/build-android.sh hands them to Gradle as ORG_GRADLE_PROJECT_* variables,
// which Gradle reads as project properties. Without them a build keeps the debug key; a release build
// (CHESS_BUILD_PROFILE=release) stops at prebuild, naming what is missing.
const { existsSync } = require('node:fs')
const { withAppBuildGradle } = require('expo/config-plugins')

const MARKER = "project.hasProperty('CHESS_ANDROID_KEYSTORE')"

const RELEASE_SIGNING_CONFIG = `        release {
            if (${MARKER}) {
                storeFile file(CHESS_ANDROID_KEYSTORE)
                storePassword CHESS_ANDROID_KEYSTORE_PASSWORD
                keyAlias CHESS_ANDROID_KEY_ALIAS
                keyPassword CHESS_ANDROID_KEY_PASSWORD
            }
        }
`

const RELEASE_BUILD_TYPE =
  /(\n {8}release \{\n(?: {12}\/\/.*\n)*) {12}signingConfig signingConfigs\.debug\n/

/** The release key's settings from the environment, or null for a development build; throws on what is missing. */
function signingFromEnv(env) {
  if (env.CHESS_BUILD_PROFILE !== 'release') return null
  for (const name of [
    'CHESS_ANDROID_KEYSTORE',
    'CHESS_ANDROID_KEYSTORE_PASSWORD',
    'CHESS_ANDROID_KEY_ALIAS',
  ]) {
    if (!env[name])
      throw new Error(
        `with-release-signing: ${name} is not set; a release APK needs the owner's keystore`,
      )
  }
  if (!existsSync(env.CHESS_ANDROID_KEYSTORE))
    throw new Error(
      `with-release-signing: the keystore ${env.CHESS_ANDROID_KEYSTORE} (CHESS_ANDROID_KEYSTORE) is not there`,
    )
  return {
    storeFile: env.CHESS_ANDROID_KEYSTORE,
    storePassword: env.CHESS_ANDROID_KEYSTORE_PASSWORD,
    keyAlias: env.CHESS_ANDROID_KEY_ALIAS,
    // keytool's PKCS12 keystores have one password for the store and the key.
    keyPassword: env.CHESS_ANDROID_KEY_PASSWORD || env.CHESS_ANDROID_KEYSTORE_PASSWORD,
  }
}

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle
  if (!gradle.includes('    signingConfigs {\n') || !RELEASE_BUILD_TYPE.test(gradle)) {
    throw new Error(
      'with-release-signing: signingConfigs / release buildType not found in app/build.gradle — ' +
        'the Expo template changed; update plugins/with-release-signing.js',
    )
  }
  return gradle
    .replace('    signingConfigs {\n', `    signingConfigs {\n${RELEASE_SIGNING_CONFIG}`)
    .replace(
      RELEASE_BUILD_TYPE,
      `$1            signingConfig ${MARKER} ? signingConfigs.release : signingConfigs.debug\n`,
    )
}

const withReleaseSigning = (config) => {
  signingFromEnv(process.env)
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents)
    return mod
  })
}

module.exports = withReleaseSigning
module.exports.addReleaseSigning = addReleaseSigning
module.exports.signingFromEnv = signingFromEnv
