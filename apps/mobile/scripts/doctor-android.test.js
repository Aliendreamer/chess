const { REQUIRED_SDK_PACKAGES, checkToolchain } = require('./doctor-android')

const complete = () => ({
  javaVersion: '17.0.16',
  javaHomeVersion: '17.0.16',
  env: { JAVA_HOME: '/usr/lib/jvm/java-17-openjdk-amd64', ANDROID_HOME: '/home/u/Android/Sdk' },
  installedSdkPackages: [...REQUIRED_SDK_PACKAGES],
})

const failing = (facts) =>
  checkToolchain(facts)
    .filter((check) => !check.ok)
    .map((check) => check.name)

describe('checkToolchain', () => {
  test('passes a complete toolchain', () => {
    expect(failing(complete())).toEqual([])
  })

  test('requires the Android 16 platform, build-tools, NDK, CMake (the Stockfish module), and platform-tools', () => {
    expect(REQUIRED_SDK_PACKAGES).toEqual([
      'platform-tools',
      'platforms;android-36',
      'build-tools;36.0.0',
      'ndk;27.1.12297006',
      'cmake;3.22.1',
    ])
  })

  test('fails when Java is not 17', () => {
    expect(failing({ ...complete(), javaVersion: '21.0.4' })).toEqual(['JDK 17'])
  })

  test('fails when Java is missing', () => {
    expect(failing({ ...complete(), javaVersion: null })).toEqual(['JDK 17'])
  })

  test('fails when an environment variable is unset', () => {
    const facts = complete()
    delete facts.env.ANDROID_HOME

    expect(failing(facts)).toEqual(['ANDROID_HOME'])
  })

  test('fails for each missing SDK package', () => {
    const facts = {
      ...complete(),
      installedSdkPackages: ['platform-tools', 'platforms;android-36'],
    }

    expect(failing(facts)).toEqual(['build-tools;36.0.0', 'ndk;27.1.12297006', 'cmake;3.22.1'])
  })

  test('fails when JAVA_HOME points at a JDK other than 17', () => {
    expect(failing({ ...complete(), javaHomeVersion: '21.0.4' })).toEqual(['JAVA_HOME'])
  })
})
