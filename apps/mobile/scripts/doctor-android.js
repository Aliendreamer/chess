// Checks the local Android toolchain the Gradle build needs (from SpanishGameApp; CMake added for the Stockfish module,
// mobile-app D6). Install it with scripts/setup-android.sh.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REQUIRED_SDK_PACKAGES = [
  'platform-tools',
  'platforms;android-36',
  'build-tools;36.0.0',
  'ndk;27.1.12297006',
  'cmake;3.22.1',
]

const isJdk17 = (version) => /^17(\.|$)/.test(version ?? '')

function checkToolchain({ javaVersion, javaHomeVersion, env, installedSdkPackages }) {
  return [
    { name: 'JDK 17', ok: isJdk17(javaVersion), detail: javaVersion ?? 'not found' },
    {
      name: 'JAVA_HOME',
      ok: Boolean(env.JAVA_HOME) && isJdk17(javaHomeVersion),
      detail: env.JAVA_HOME ? `${env.JAVA_HOME} (${javaHomeVersion ?? 'no java'})` : 'not set',
    },
    { name: 'ANDROID_HOME', ok: Boolean(env.ANDROID_HOME), detail: env.ANDROID_HOME ?? 'not set' },
    ...REQUIRED_SDK_PACKAGES.map((name) => {
      const ok = installedSdkPackages.includes(name)
      return { name, ok, detail: ok ? 'installed' : 'missing' }
    }),
  ]
}

// `java -version` prints to stderr, so read both streams.
function javaVersionOf(javaBinary) {
  const java = spawnSync(javaBinary, ['-version'], { encoding: 'utf8' })
  return /version "([^"]+)"/.exec(`${java.stdout}${java.stderr}`)?.[1] ?? null
}

function collectFacts(env = process.env) {
  const sdk = env.ANDROID_HOME
  return {
    javaVersion: javaVersionOf('java'),
    javaHomeVersion: env.JAVA_HOME ? javaVersionOf(path.join(env.JAVA_HOME, 'bin', 'java')) : null,
    env,
    installedSdkPackages: sdk
      ? REQUIRED_SDK_PACKAGES.filter((pkg) => fs.existsSync(path.join(sdk, ...pkg.split(';'))))
      : [],
  }
}

if (require.main === module) {
  const checks = checkToolchain(collectFacts())
  for (const { name, ok, detail } of checks) console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`)
  if (checks.some((check) => !check.ok)) {
    console.error('\nMissing prerequisites: run scripts/setup-android.sh')
    process.exit(1)
  }
}

module.exports = { REQUIRED_SDK_PACKAGES, checkToolchain }
