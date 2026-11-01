#!/usr/bin/env bash
# Builds the Stockfish bridge on the host with the real, fetched Stockfish source and runs its checks (mobile-app D6,
# D13; task 3.2): the swapped streams, the batcher, the request marker and the crash record. Stockfish's objects are
# kept in modules/stockfish/.host-build/ between runs (git-ignored); the bridge and the test are rebuilt every time.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
module="$here/../../apps/mobile/modules/stockfish"
src="$module/vendor/src"
build="$module/.host-build"
[ -d "$src" ] || node "$here/fetch-stockfish-src.mjs"
mkdir -p "$build"

CXX="${CXX:-g++}"
FLAGS=(-std=c++17 -O2 -DNDEBUG -DIS_64BIT -pthread -w)
SF_SRCS=(attacks.cpp benchmark.cpp bitboard.cpp evaluate.cpp misc.cpp movegen.cpp movepick.cpp position.cpp
  search.cpp thread.cpp timeman.cpp tt.cpp uci.cpp ucioption.cpp tune.cpp syzygy/tbprobe.cpp
  nnue/nnue_accumulator.cpp nnue/nnue_misc.cpp nnue/network.cpp nnue/features/half_ka_v2_hm.cpp
  nnue/features/full_threats.cpp nnue/features/pp_3wide.cpp engine.cpp score.cpp memory.cpp)

objects=()
pids=()
for s in "${SF_SRCS[@]}"; do
  o="$build/${s//\//_}.o"
  objects+=("$o")
  # From src/, so INCBIN finds the network next to the sources.
  [ -f "$o" ] || (cd "$src" && "$CXX" "${FLAGS[@]}" -fno-exceptions -c "$s" -o "$o") & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

"$CXX" "${FLAGS[@]}" -DSFBRIDGE_CRASH_TEST -I"$src" -c "$module/cpp/bridge.cpp" -o "$build/bridge.o"
"$CXX" "${FLAGS[@]}" -I"$module/cpp" -c "$module/cpp/test/bridge_test.cpp" -o "$build/bridge_test.o"
"$CXX" "${FLAGS[@]}" "${objects[@]}" "$build/bridge.o" "$build/bridge_test.o" -o "$build/bridge_test"
"$build/bridge_test"
