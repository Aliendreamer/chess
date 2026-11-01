# Stockfish 19 inside the app (mobile-app D6): its unmodified sources, the bridge and the JNI glue as one library.
cmake_minimum_required(VERSION 3.22.1)
project(stockfishbridge CXX)

set(CMAKE_CXX_STANDARD 17)
set(SF "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/src")
set(BRIDGE "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")

file(GLOB NETWORK "${SF}/nn-*.nnue")
if(NOT NETWORK)
  message(FATAL_ERROR "No Stockfish source: run `node tools/mobile/fetch-stockfish-src.mjs` (pnpm fetch-stockfish).")
endif()

# Stockfish's Makefile list (SRCS) without main.cpp: the bridge does what main() does, on a thread.
set(SF_SOURCES
  attacks.cpp benchmark.cpp bitboard.cpp evaluate.cpp misc.cpp movegen.cpp movepick.cpp position.cpp search.cpp
  thread.cpp timeman.cpp tt.cpp uci.cpp ucioption.cpp tune.cpp syzygy/tbprobe.cpp nnue/nnue_accumulator.cpp
  nnue/nnue_misc.cpp nnue/network.cpp nnue/features/half_ka_v2_hm.cpp nnue/features/full_threats.cpp
  nnue/features/pp_3wide.cpp engine.cpp score.cpp memory.cpp)
list(TRANSFORM SF_SOURCES PREPEND "${SF}/")
set_source_files_properties(${SF_SOURCES} PROPERTIES COMPILE_OPTIONS "-fno-exceptions")

add_library(stockfishbridge SHARED ${SF_SOURCES} "${BRIDGE}/bridge.cpp" src/main/cpp/stockfish_jni.cpp)
target_include_directories(stockfishbridge PRIVATE "${SF}" "${BRIDGE}")

# Optimised in every build, the development one too (an unoptimised engine is unusably slow). `-Wa,-I` lets the
# assembler find the network that INCBIN embeds (checked with the NDK's clang, task 3.4).
target_compile_options(stockfishbridge PRIVATE -O3 -w "-Wa,-I${SF}")
target_compile_definitions(stockfishbridge PRIVATE NDEBUG IS_64BIT USE_POPCNT)
if(ANDROID_ABI STREQUAL "arm64-v8a")
  target_compile_definitions(stockfishbridge PRIVATE USE_NEON=8)
elseif(ANDROID_ABI STREQUAL "x86_64")
  target_compile_definitions(stockfishbridge PRIVATE USE_SSE2)
  target_compile_options(stockfishbridge PRIVATE -msse4.1 -mpopcnt)
endif()
# The development build's "crash test" (D13): a fault on the engine thread on purpose. Never in a release.
target_compile_definitions(stockfishbridge PRIVATE $<$<CONFIG:Debug>:SFBRIDGE_CRASH_TEST>)

target_link_libraries(stockfishbridge log)
