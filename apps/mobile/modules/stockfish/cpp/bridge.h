// The Stockfish bridge (mobile-app D6, D13): Stockfish's own UCI loop on a thread of its own inside the app, its
// std::cin and std::cout swapped for a line queue in and a batcher out. The platform glue (JNI on Android, Obj-C++ on
// iOS) only forwards these calls and the callbacks. It knows no chess: UCI text both ways.
#pragma once

#include <functional>
#include <string>
#include <vector>

namespace sfbridge {

struct Callbacks {
    /** A batch of output lines, in order; called on the bridge's own thread. */
    std::function<void(std::vector<std::string>)> onLines;
    /** The engine ended: "quit" (asked for) or "error" (it could not start). */
    std::function<void(const std::string&)> onExit;
};

/**
 * Starts the engine thread; false when one is running. `filesDir` is where the request marker and the crash record
 * are kept (the app's documents directory).
 */
bool start(Callbacks callbacks, const std::string& filesDir);

/**
 * Queues one UCI line and returns at once. `# request {json}` is kept for the crash record and never reaches
 * Stockfish; so is `# crash-test` (a fault on the engine thread, only in builds with SFBRIDGE_CRASH_TEST).
 */
void send(const std::string& line);

/** Sends `quit` and waits for the engine thread to end. */
void quit();

/** What the last run left in `filesDir`: the crash record and the request marker ("" when absent). */
struct LeftFiles {
    std::string crash;
    std::string marker;
};

/** Reads and removes the crash record and the request marker (mobile-app D13), before the engine starts again. */
LeftFiles takeFiles(const std::string& filesDir);

}  // namespace sfbridge
