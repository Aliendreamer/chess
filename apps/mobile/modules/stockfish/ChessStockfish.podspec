# Stockfish 19 inside the app on iOS (mobile-app D6): its unmodified sources (vendor/, fetched by
# tools/mobile/fetch-stockfish-src.mjs), the bridge (cpp/) and the Objective-C++/Swift glue (ios/). At the module's
# root, not in ios/, because CocoaPods takes no source file outside the podspec's folder.
Pod::Spec.new do |s|
  s.name           = 'ChessStockfish'
  s.version        = '1.0.0'
  s.summary        = 'Stockfish 19 compiled into the chess app.'
  s.license        = { :type => 'GPL-3.0-or-later', :file => 'vendor/Copying.txt' }
  s.author         = 'aliendreamer'
  s.homepage       = 'https://github.com/Aliendreamer/chess'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}', 'cpp/bridge.{h,cpp}', 'vendor/src/**/*.{h,cpp}'
  # Stockfish's main() is replaced by the bridge; the universal build and the host test are not for the app.
  s.exclude_files = 'vendor/src/main.cpp', 'vendor/src/universal/**/*', 'cpp/test/**/*'
  # Only the Objective-C header is public: C++ headers in the Swift module's umbrella header would break it.
  s.public_header_files  = 'ios/SFBridge.h'
  s.private_header_files = 'cpp/*.h', 'vendor/src/**/*.h'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    # Optimised in every build, the development one too (an unoptimised engine is unusably slow).
    'GCC_OPTIMIZATION_LEVEL' => '3',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) NDEBUG=1 IS_64BIT=1 USE_POPCNT=1',
    # The development build's crash test (D13); never in a release.
    'GCC_PREPROCESSOR_DEFINITIONS[config=Debug]' => '$(inherited) NDEBUG=1 IS_64BIT=1 USE_POPCNT=1 SFBRIDGE_CRASH_TEST=1',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/vendor/src" "${PODS_TARGET_SRCROOT}/cpp"',
    # -Wa,-I: the assembler finds the network INCBIN embeds (as on Android). NEON on arm64 (phones, Apple-silicon
    # simulators); SSE on an Intel Mac's x86_64 simulator.
    'OTHER_CPLUSPLUSFLAGS' => '$(inherited) -w "-Wa,-I${PODS_TARGET_SRCROOT}/vendor/src"',
    'OTHER_CPLUSPLUSFLAGS[arch=arm64]' => '$(inherited) -w "-Wa,-I${PODS_TARGET_SRCROOT}/vendor/src" -DUSE_NEON=8',
    'OTHER_CPLUSPLUSFLAGS[arch=x86_64]' => '$(inherited) -w "-Wa,-I${PODS_TARGET_SRCROOT}/vendor/src" -DUSE_SSE2 -msse4.1 -mpopcnt',
  }
end
